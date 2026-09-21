# GBA in a VS Code tab

A custom editor that runs a Game Boy Advance cartridge inside an editor tab. Open any
`.gba` file and the machine starts. Battery saves are written to the extension storage
folder beside the ROM name.

Bring your own cartridge dump. None is shipped here.

## Build

```
npm install
npm run build          # vendors the core then bundles the extension
npm run package        # produces gba-webview-0.1.0.vsix
```

`npm run build` copies the EmulatorJS runtime and the mGBA core out of `node_modules`
into `media/data`. That folder is the only thing the webview can reach.

Press F5 in VS Code to launch an extension host. Then open a `.gba` file.

## Shape

| File | Holds |
| --- | --- |
| `src/extension.ts` | Custom editor registration. Reads the ROM. Writes the battery save. |
| `src/webviewHtml.ts` | The page and its Content Security Policy. |
| `media/webview/boot.js` | Configures EmulatorJS and talks to the extension host. |
| `scripts/vendor.mjs` | Copies the runtime and the core into `media/data`. |
| `test/make-rom.mjs` | A tiny ARM assembler and the test cartridge it builds. |
| `test/run-webview.mjs` | Boots the real page in headless chromium and checks the picture. |
| `test/run-guard.mjs` | Runs the extension against a stub `vscode` and checks the keyboard guard. |

## The five things that decide whether this works

**A webview is not cross origin isolated.** `crossOriginIsolated` is false and
`SharedArrayBuffer` is undefined. Any core built with pthreads is therefore out. The
single threaded `mgba-wasm.data` build is used and `EJS_threads` is forced to false.

**The Content Security Policy needs `'unsafe-eval'`.** The libretro glue evaluates
strings so `'wasm-unsafe-eval'` alone raises an `EvalError` and the core never starts.
This is tolerable here. Because a) `default-src` is `'none'` b) every other directive is
pinned to `webview.cspSource` or to `blob:` c) nothing outside `media/` is reachable as a
webview resource.

**Nothing large may cross the message channel.** A 16 MiB cartridge posted to a webview
arrives as zero bytes and nothing warns. The core then fails several seconds later deep
inside an unrelated call. So the cartridge is served over the resource protocol and the
ROM's own folder is added to `localResourceRoots`. Saves and states are small enough to
post but they go as base64 text. Because a typed array is not carried faithfully either
way.

**Every URL must go through `asWebviewUri`.** The emulator builds its own paths by
concatenating `EJS_pathtodata` so that value has to be a webview URI with a trailing
slash. `connect-src` must name `cspSource` as well or the core download is refused.

**The tab must survive a switch.** `retainContextWhenHidden` keeps the running machine
alive. Without it the webview is disposed and the session is lost.

**The page must be served last.** A webview posts its first message the moment its script
runs. A listener registered after that message arrives never sees it. The page then waits
for a load that never comes. Nothing is thrown and nothing is logged so the only symptom
is a screen that reads *Loading the core* for ever. So `webview.html` is assigned after
`onDidReceiveMessage` rather than before.

## The keyboard

A webview forwards its keystrokes to the VS Code keybinding layer. So a pad key can run
an editor command while you are playing. Tab is the plain example. It moves focus out of
the tab and the run carries on without you.

`boot.js` reports window focus and blur to the host. The host turns that into the
`gba.focused` context key. `contributes.keybindings` then parks every pad key on
`gba.swallowKey` under `when: gba.focused`. That command does nothing. VS Code consumes
the key and runs no editor command while the webview still receives the keydown
natively.

The whole pad is guarded rather than the handful of keys that collide today. Because
a) a user may bind a plain key themselves b) VS Code adds bindings between releases
c) guarding a key that nothing else claims costs nothing.

A context key is global to the window. Nothing scopes those bindings to the webview. So a
guard left standing with nobody playing swallows the same keys in a text editor.

`refreshGuard` works the key out from what is live on every event. It holds while the
window has the system keyboard and a surface that is still alive reports the keyboard from
a place that is on screen. Because a) minimising fires no view state change so a page that
went down holding the keyboard would keep the guard for ever b) a page destroyed by a
dispose or by a reload posts no blur to clear itself c) one missed clear used to stand for
the rest of the session.

`onDidChangeWindowState` reports the first of those three. An extension is told nowhere
else that the keyboard has left the window.

The guarded set is the EmulatorJS mGBA default. That is `x` `s` `v` `enter` the four
arrows `z` `a` `q` `e` `tab` and `r`. Change the pad in the emulator settings and edit
`contributes.keybindings` to match.

`escape` is deliberately left alone so there is always a way out.

`gba.swallowKey` is registered in code and left out of `contributes.commands`. Because a
declared command appears in the command palette and this one is not for people.

## Where it plays

Two surfaces share one session.

**An editor tab.** The custom editor on `*.gba`. Full width, splittable, and it can be
dragged into its own operating system window with *Move into New Window*.

**A section in the side bar.** A webview view contributed to the Explorer container. It
sits below the file tree and collapses like any other section. It starts collapsed so it
costs nothing until you want it. A 240 by 160 screen is happy in a narrow column.

`GBA: Play in Side Bar` and `GBA: Play in Editor Tab` move between them. The view is not
bound to a file the way a tab is so it follows whichever cartridge was opened last. Drag
it to the panel or the secondary side bar if either suits you better.

Collapsing the section does not stop the game. `retainContextWhenHidden` holds the
machine and the sound carries on. Minimising the window does stop it.

Only one machine runs at a time. Because two cores on one cartridge would take turns
overwriting the same save file. When a surface takes the cartridge the other is asked to
hand over a state first, so the position carries rather than falling back to the last
battery save. The wait is bounded at three seconds. Because a webview that has already
gone will never answer and the new machine must still start.

## Layout

Two things push the picture off centre.

**VS Code injects its own stylesheet ahead of the page's.** That stylesheet puts `0 20px`
of padding on the body. A `#game` sized at `100vw` then starts after the left padding and
runs twenty pixels off the right edge. What shows is a black bar down the left with a
clipped right edge. So the padding is reset and the box is sized against the body rather
than against the viewport. A viewport unit does not track a padded box.

**The core puts its letterbox at the top.** Given a box that is not the shape of the
picture it draws at the top and leaves the rest black below. In a side bar column that is
most of the section. So the box is cut to the shape of the picture instead and a grid
centres it. There is then no letterbox for the core to misplace.

The shape comes from `getVideoDimensions("aspect")`. Because a Game Boy cartridge is 10:9
and must not be forced into the 3:2 of a Game Boy Advance one.

## Minimising

The machine suspends when the window is minimised. The main loop stops and the sound goes
silent. Restoring the window starts both again. Somebody who muted the sound beforehand
stays muted.

A minimised window is not the same as a hidden surface. A collapsed side bar section and a
tab that is not on top leave the document hidden as well. The page cannot tell the three
apart on its own. So the host reports whether the surface is still on screen. Hidden while
on screen is a minimised window and nothing else.

`setVolume` applies a level and never records it. The chosen level lives in
`EJS_emulator.volume` so that is what a resume applies again.

## Reload

`GBA: Reload` serves the page again. The core restarts from the top so the whole boot is
logged a second time. The refresh button on the editor tab and on the side bar section
runs the same command.

The message listener is left alone across a reload. Because a second listener would answer
every message twice.

`renderHtml` draws a fresh nonce on every call so the html always differs. VS Code ignores
an assignment that matches what the webview already holds.

The command acts on the surface that last became active. That is the rule the state
commands already follow.

## Saves

Everything lands in `globalStorageUri/saves/` keyed on a SHA-1 of the cartridge bytes
rather than on its file name. Because a) a rename or a move no longer orphans the save
b) two copies of one dump share a save correctly c) two different games both called
`rom.gba` stop colliding. A save written by an earlier version is carried across on
first open.

| File | Holds |
| --- | --- |
| `<hash>.srm` | Battery save. The cartridge RAM. |
| `<hash>.state` | Save state. What you saved with the command. |
| `<hash>.auto.state` | The timer's own snapshot. Never touched by the command. |
| `index.json` | Hash to last known ROM name so the folder is readable. |

**Battery saves look after themselves.** The core writes its cartridge RAM to its own
virtual filesystem. `saveSaveFiles` fires an event carrying those bytes and `boot.js`
posts them out. Three triggers drive it. A timer on `gba.saveIntervalSeconds`. The
`pagehide` and `blur` events. The core's own write. The host checksums before touching
the disc. Because the core reports the whole region every time whether or not a byte
changed.

A save is read back on start up and written into the core filesystem at
`gameManager.getSaveFilePath()` before `loadSaveFiles()` is called.

**Save states are driven by two commands.** `GBA: Save State` and `GBA: Load State` in
the palette. Both appear only while a cartridge tab is active.

Note that the Quick Save item in the EmulatorJS menu is not these. It drives RetroArch's
own slots inside the core filesystem and fires no event so nothing can intercept it.
Those slots do not survive the tab closing. The two commands call
`gameManager.getState()` and `gameManager.loadState()` directly and the host owns the
file.

**A state is taken automatically.** `gba.autoStateMinutes` defaults to 5 and zero turns
it off. It is filed as `<hash>.auto.state`. Because a timer must never overwrite the
state somebody chose to keep.

Opening a cartridge carries on from that automatic state. Set `gba.resumeFromAutoState`
to false to start where the battery save left off instead.

One deliberate state per cartridge. There are no slots.

## Test

```
npm test
```

`test/make-rom.mjs` writes a cartridge from nothing. It carries a small ARM7TDMI
assembler so no toolchain is needed. The program it emits is sixteen instructions. It
puts the display into mode 3 then walks the framebuffer painting a two axis ramp. Red is
driven by the column counter and green by the row counter. Blue is never touched.

`test/run-webview.mjs` renders the page through the extension's own `renderHtml` and
serves it under the real policy. Then it boots chromium and takes a composited
screenshot. The screenshot goes back into the page as a data URL to be decoded. Because
a WebGL canvas cannot be read back reliably and a composited capture always carries what
reached the screen.

Six assertions run against the picture. Red must fall across a row and hold down a
column. Green must do the reverse. Blue must stay off. That fails if the core stops
painting or if the framebuffer wiring breaks.

Two more cover the state path. The harness posts `takeState` and `applyState` into the
page exactly as the commands do. A state must come back and it must load again without
complaint.

Three cover the layout. The bars around the picture are measured out of the capture. They
must match on both axes and the picture must hold its shape. The harness carries the
stylesheet VS Code injects so the page under test is the page that ships. `WINDOW` sets
the window size so a side bar column can be reproduced. It defaults to `800,600`.

Eleven cover the keyboard guard. `test/run-guard.mjs` calls the extension's own
`activate` against a stub `vscode` module so no display is needed. A minimised window must
drop the guard. A restored window must put it back. A disposed surface must drop it. So
must a reload. A page must not raise it while the window is unfocused. The key must be set
only when it changes.

Five cover suspension. `document.hidden` is read only so the harness shadows it on the
document and fires the event a browser would fire. The machine must go quiet on a minimise
and come back on a restore. It must carry on when the host says the surface went away with
the document.

The extension host itself is not exercised. Because no virtual display is available here
to run one.

## Logging

`GBA: Show Log` opens an output channel. It is a `LogOutputChannel` so the level picker
in the channel header applies.

The host records the file it opened and the ROM size and the storage key. The webview
forwards its whole console. Because EmulatorJS reports everything that way and nothing
else. Even a refusal to start is a `console.log` inside `startGameError`.

`gba.log` chooses whether the routine chatter is filed at info or at debug. Nothing is
ever dropped so the setting cannot hide a fault.

It defaults to `all` so the whole boot is visible without touching anything. Because a) an
output channel records nothing below its own level b) that level starts at info. Set it to
`errors` once a cartridge runs and only the faults stay at info.

The level the channel is running at is the first line written to it.

A watch runs alongside the boot. Nothing is thrown when the core declines to start so it
polls `failedToStart` and reads the reason out of the page. A boot that simply never
finishes is reported after 45 seconds with whatever the status line last said.

## Licence

EmulatorJS and the mGBA core are GPL-3.0. Vendoring them makes this extension GPL-3.0.
