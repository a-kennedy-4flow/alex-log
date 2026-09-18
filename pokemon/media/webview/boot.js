(function () {
  "use strict";

  const vscode = acquireVsCodeApi();
  // Anything said before the machine is running is evidence. It is marked so
  // the host files it at info whatever the setting says. Because the routine
  // chatter is only noise once a game is actually playing.
  let running = false;
  const say = (level, text) =>
    vscode.postMessage({ type: "log", level, text: String(text), important: !running });

  // EmulatorJS reports everything through the console and nothing else. Even a
  // refusal to start is a console.log inside startGameError. So the console is
  // the only place a diagnosis can come from and it is forwarded to the host.
  for (const level of ["log", "info", "warn", "error"]) {
    const original = console[level].bind(console);
    console[level] = function (...args) {
      original(...args);
      say(level === "log" ? "info" : level, args.map(describe).join(" "));
    };
  }

  // The core arrives as a several megabyte fetch over the resource protocol. A
  // short read leaves a module that instantiates and then fails on its first
  // indirect call. So every transfer is measured.
  const RealXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function () {
    const xhr = new RealXHR();
    xhr.addEventListener("loadend", function () {
      let size = "unknown";
      try {
        const body = xhr.response;
        if (body && body.byteLength !== undefined) size = body.byteLength;
        else if (typeof body === "string") size = body.length;
      } catch {
        size = "unreadable";
      }
      const name = String(xhr.responseURL || "").split("/").pop() || "?";
      say("info", `fetched ${name} status ${xhr.status} ${size} bytes`);
      if (String(xhr.responseURL || "").startsWith(romUrl) && size === 0) {
        vscode.postMessage({
          type: "error",
          text: "the cartridge came back empty from " + xhr.responseURL,
        });
      }
    });
    return xhr;
  };

  // Binary crossing the message channel goes as text. A typed array can arrive
  // empty and nothing warns when it does.
  function decode(text) {
    if (!text) return null;
    const raw = atob(text);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function encode(data) {
    const view = data instanceof Uint8Array ? data : new Uint8Array(data);
    let text = "";
    // Chunked because apply() on a whole save blows the argument limit.
    for (let at = 0; at < view.length; at += 0x8000) {
      text += String.fromCharCode.apply(null, view.subarray(at, at + 0x8000));
    }
    return btoa(text);
  }

  function describe(value) {
    if (typeof value === "string") return value;
    if (value instanceof Error) return value.stack || String(value);
    let text;
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
    // EmulatorJS logs whole config objects. One of them carries every menu icon
    // as inline SVG and runs to tens of thousands of characters.
    return text && text.length > 400 ? text.slice(0, 400) + ` ...[${text.length} chars]` : text;
  }
  let status = document.getElementById("status");
  const dataPath = window.GBA_DATA_PATH;
  let romUrl = "\u0000none";

  // EmulatorJS checks its own version against a public CDN on start up. Refuse
  // every request that is not a vendored file so the extension stays offline.
  const passThrough = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = String(typeof input === "string" ? input : input.url);
    const local = url.startsWith(dataPath) || url.startsWith(romUrl) ||
      url.startsWith("blob:") || url.startsWith("data:");
    // Answering with a failed response rather than rejecting keeps callers
    // that never attached a catch handler quiet.
    return local ? passThrough(input, init) : Promise.resolve(new Response(null, { status: 503 }));
  };

  window.addEventListener("message", function (event) {
    const message = event.data;
    if (!message) return;
    // The Quick Save item in the EmulatorJS menu drives RetroArch's own slots
    // inside the core filesystem and never reaches an event. So states are
    // taken and applied here instead and the host owns the file.
    const handlers = {
      load: () => boot(message),
      // The Quick Save item in the EmulatorJS menu drives RetroArch's own slots
      // inside the core filesystem and never reaches an event. So states are
      // taken and applied here instead and the host owns the file.
      takeState: () => takeState(),
      applyState: () => applyState(message.data),
      standDown: () => standDown(),
    };
    const handler = handlers[message.type];
    // A message with no handler used to vanish without trace. That is how the
    // load state command managed to do nothing at all for several versions.
    if (!handler) return say("warn", "no handler for message type " + message.type);
    handler();
  });

  // Another surface wants this cartridge. Hand over the exact position then go
  // quiet. Two running cores would take turns overwriting one save file.
  let heartbeat;
  let snapshot;
  function standDown() {
    const manager = window.EJS_emulator && window.EJS_emulator.gameManager;
    clearInterval(heartbeat);
    clearInterval(snapshot);
    window.removeEventListener("pagehide", commit);
    window.removeEventListener("blur", commit);
    takeState();
    if (!manager) return;
    try {
      manager.toggleMainLoop(0);
      window.EJS_emulator.setVolume(0);
    } catch (error) {
      say("warn", "could not pause on handover: " + error);
    }
    status = document.createElement("div");
    status.id = "status";
    status.textContent = "Handed over to the other window.";
    document.body.appendChild(status);
  }

  // An automatic snapshot is filed separately from a deliberate one. Because a
  // timer must never overwrite the state somebody chose to keep.
  function takeState(auto) {
    const manager = window.EJS_emulator && window.EJS_emulator.gameManager;
    if (!manager) return;
    try {
      vscode.postMessage({ type: "state", data: encode(manager.getState()), auto: !!auto });
    } catch (error) {
      if (auto) return say("warn", "could not take an automatic state: " + error);
      vscode.postMessage({ type: "error", text: "could not take a state: " + error });
    }
  }

  function applyState(data) {
    const manager = window.EJS_emulator && window.EJS_emulator.gameManager;
    if (!manager) return;
    try {
      manager.loadState(decode(data));
      window.EJS_emulator.displayMessage("State loaded");
    } catch (error) {
      vscode.postMessage({ type: "error", text: "could not load the state: " + error });
    }
  }

  window.addEventListener("error", function (event) {
    vscode.postMessage({ type: "error", text: String(event.message) });
  });

  // A refusal to start leaves no exception behind. It sets a flag and writes the
  // reason into the page. Nothing is thrown so only a watch catches it.
  function watchForRefusal() {
    const deadline = Date.now() + 45000;
    let described = false;
    const timer = setInterval(function () {
      const emulator = window.EJS_emulator;
      if (emulator && !described) {
        described = true;
        // Which core actually arrives is reported by the transfer line above.
        // Only the input to that choice is worth stating here.
        say("info", `webgl2 supported ${emulator.supportsWebgl2}, core ${emulator.getCore()}`);
      }
      if (emulator && emulator.started) return clearInterval(timer);
      if (emulator && emulator.failedToStart) {
        clearInterval(timer);
        const reason = (emulator.textElem && emulator.textElem.innerText) || "no reason given";
        vscode.postMessage({ type: "error", text: "the core refused to start: " + reason });
        return;
      }
      if (Date.now() > deadline) {
        clearInterval(timer);
        const shown = document.getElementById("status");
        vscode.postMessage({
          type: "error",
          text: "the core did not start within 45 seconds. Last shown: " +
            ((shown && shown.textContent) || "nothing"),
        });
      }
    }, 1000);
  }

  // A webview grants no wake lock and EmulatorJS asks for one anyway. Swallow
  // the rejection so it does not read as a failure.
  window.addEventListener("unhandledrejection", function (event) {
    if (String(event.reason).includes("Wake Lock")) event.preventDefault();
  });

  function boot(message) {
    romUrl = message.romUrl;
    const save = decode(message.save);


    window.EJS_player = "#game";
    window.EJS_core = "gba";
    window.EJS_gameName = message.name;
    window.EJS_gameUrl = message.romUrl;
    window.EJS_pathtodata = dataPath;
    // Only the shipped translations exist so the browser locale is ignored.
    window.EJS_disableAutoLang = true;
    window.EJS_language = "en-US";
    // The published package carries readable sources and no minified bundle.
    window.EJS_DEBUG_XX = true;
    // A webview is not cross origin isolated so SharedArrayBuffer is absent.
    window.EJS_threads = false;
    window.EJS_startOnLoaded = true;
    window.EJS_volume = message.volume;
    // Battery saves belong on disc under the extension storage folder.
    window.EJS_disableDatabases = true;

    window.EJS_onGameStart = function () {
      running = true;
      if (status) status.remove();
      restore(save);
      const seconds = Math.max(1, message.saveIntervalSeconds || 10);
      heartbeat = setInterval(commit, seconds * 1000);
      const minutes = Number(message.autoStateMinutes);
      if (minutes > 0) {
        snapshot = setInterval(function () { takeState(true); }, minutes * 60000);
        say("info", `automatic state every ${minutes} minutes`);
      }
      // A position carried over from the surface that just gave it up.
      if (message.resume) applyState(message.resume);
      window.addEventListener("pagehide", commit);
      window.addEventListener("blur", commit);
      document.querySelector("canvas")?.focus();
    };

    window.EJS_onLoadSave = function () {
      restore(save);
    };

    window.EJS_onSaveSave = function (event) {
      if (event && event.save) vscode.postMessage({ type: "save", data: encode(event.save) });
    };

    say("info", "rom " + message.name + " served from " + message.romUrl +
      (save ? ", save " + save.length + " bytes" : ", no save"));
    watchForRefusal();

    const script = document.createElement("script");
    script.src = window.GBA_LOADER;
    document.body.appendChild(script);
  }

  function commit() {
    const manager = window.EJS_emulator && window.EJS_emulator.gameManager;
    if (!manager) return;
    manager.saveSaveFiles();
    const bytes = manager.getSaveFile();
    if (bytes) vscode.postMessage({ type: "save", data: encode(bytes) });
  }

  function restore(save) {
    if (!save || !save.length) return;
    const manager = window.EJS_emulator.gameManager;
    const path = manager.getSaveFilePath();

    let walked = "";
    const parts = path.split("/");
    for (let i = 0; i < parts.length - 1; i++) {
      if (parts[i] === "") continue;
      walked += "/" + parts[i];
      if (!manager.FS.analyzePath(walked).exists) manager.FS.mkdir(walked);
    }
    if (manager.FS.analyzePath(path).exists) manager.FS.unlink(path);
    manager.FS.writeFile(path, save);
    manager.loadSaveFiles();
  }

  // The host turns this into a when clause context key so the contributed
  // bindings can park the pad keys while the machine has the keyboard.
  const report = (value) => vscode.postMessage({ type: "focus", value });
  window.addEventListener("focus", () => report(true));
  window.addEventListener("blur", () => report(false));
  if (document.hasFocus()) report(true);

  vscode.postMessage({ type: "ready" });
})();
