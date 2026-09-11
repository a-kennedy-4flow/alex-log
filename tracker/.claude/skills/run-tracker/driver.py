#!/usr/bin/env python3
"""Drives the tracker web app in a real browser over the DevTools protocol.

The app is a Vue single page app so nothing it draws exists until its script
has run. Vitest mounts components under jsdom and jsdom applies no stylesheet
at all. So a layout or an animation or anything else that only shows on screen
has to be looked at here.

One invocation is one browser session. Steps run in the order they are given.

    driver.py --serve --step 'go /credits' --step 'shot credits.png'

Steps
    go <path>          navigate to the path and wait for the shell
    waitfor <css>      wait until the selector matches
    wait <seconds>     wait for a fixed time
    click <css> [n]    dispatch n clicks on the first match. n defaults to 1
    type <css> :: <text>   set the value of an input and fire its input event
    text <css>         print the text of the first match
    eval <js>          print the value of an expression
    media reduce|none  emulate prefers-reduced-motion
    size <w>x<h>       resize the viewport
    shot <file>        write a screenshot into the shots directory

Every console error and every uncaught exception is printed at the end. A blank
page is nearly always one of those rather than a step that went wrong.
"""

import argparse
import base64
import glob
import json
import os
import random
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

import websocket

UNIT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
SHOTS = os.environ.get('TRACKER_SHOTS', '/tmp/tracker-run')

# The first run wizard and the guided tour both open over whatever page is
# asked for on a browser profile with no history. Marked seen before the app
# boots because both are read once at module load.
SEED = (
    "localStorage.setItem('tracker.wizardSeen', new Date().toISOString());"
    "localStorage.setItem('timesheets.tourSeen',"
    " JSON.stringify(['month','quick','settings','admin']));"
    "'seeded'"
)


def find_chrome() -> str:
    """A chrome to drive. The playwright cache is where one usually already is."""
    named = os.environ.get('CHROME')
    if named:
        return named
    for name in ('google-chrome', 'chromium', 'chromium-browser'):
        found = shutil.which(name)
        if found:
            return found
    cached = sorted(glob.glob(os.path.expanduser(
        '~/.cache/ms-playwright/chromium-*/chrome-linux*/chrome')))
    if cached:
        return cached[-1]
    sys.exit('no chrome found. Set CHROME to one or install the playwright chromium.')


def serving(port: int) -> bool:
    try:
        with urllib.request.urlopen(f'http://localhost:{port}/', timeout=2) as answer:
            return answer.status == 200
    except Exception:
        return False


def serve(port: int) -> subprocess.Popen | None:
    """Starts vite when the port answers nothing. Returns what has to be stopped."""
    if serving(port):
        print(f'[driver] reusing the server on {port}')
        return None
    vite = subprocess.Popen(
        ['pnpm', '--filter', '@tracker/web', 'exec', 'vite', '--port', str(port), '--strictPort'],
        cwd=UNIT, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, start_new_session=True)
    for _ in range(60):
        if serving(port):
            print(f'[driver] vite is up on {port}')
            return vite
        time.sleep(0.5)
    sys.exit(f'vite never answered on {port}. Another process may hold it.')


class Browser:
    def __init__(self, size: str) -> None:
        self.profile = tempfile.mkdtemp(prefix='tracker-chrome-')
        self.events: list[dict] = []
        self.seq = 0
        width, height = size.split('x')
        port = random.randint(9310, 9399)
        # `--remote-allow-origins` or the websocket handshake answers 403.
        self.chrome = subprocess.Popen(
            [find_chrome(), '--headless=new', '--no-sandbox', '--disable-gpu',
             '--hide-scrollbars', f'--remote-debugging-port={port}',
             '--remote-allow-origins=*', f'--user-data-dir={self.profile}',
             f'--window-size={width},{height}', 'about:blank'],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        version = None
        for _ in range(80):
            try:
                with urllib.request.urlopen(f'http://127.0.0.1:{port}/json/version', timeout=2) as answer:
                    version = json.load(answer)
                break
            except Exception:
                time.sleep(0.25)
        if not version:
            sys.exit('chrome never opened its debugging port')
        self.ws = websocket.create_connection(
            version['webSocketDebuggerUrl'], max_size=None, timeout=45, suppress_origin=True)

    def call(self, method: str, params: dict | None = None, session: str | None = None) -> dict:
        self.seq += 1
        message = {'id': self.seq, 'method': method, 'params': params or {}}
        if session:
            message['sessionId'] = session
        self.ws.send(json.dumps(message))
        while True:
            answer = json.loads(self.ws.recv())
            if answer.get('id') == self.seq:
                if 'error' in answer:
                    sys.exit(f'{method} failed {answer["error"]}')
                return answer.get('result', {})
            if answer.get('method') in ('Runtime.consoleAPICalled', 'Runtime.exceptionThrown'):
                self.events.append(answer)

    def close(self) -> None:
        try:
            self.ws.close()
        finally:
            self.chrome.terminate()
            shutil.rmtree(self.profile, ignore_errors=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=5301, help='the vite port')
    parser.add_argument('--serve', action='store_true', help='start vite when nothing answers')
    parser.add_argument('--size', default='1440x1000')
    parser.add_argument('--settle', type=float, default=2.5, help='seconds a go waits after the shell')
    parser.add_argument('--first-run', action='store_true',
                        help='leave the wizard and the tour unseen')
    parser.add_argument('--step', action='append', default=[], help='repeatable. See the module docstring')
    args = parser.parse_args()

    os.makedirs(SHOTS, exist_ok=True)
    origin = f'http://localhost:{args.port}'
    vite = serve(args.port) if args.serve else None
    if not args.serve and not serving(args.port):
        sys.exit(f'nothing answers on {args.port}. Pass --serve or start vite yourself.')

    browser = Browser(args.size)
    try:
        target = browser.call('Target.createTarget', {'url': origin})['targetId']
        session = browser.call('Target.attachToTarget', {'targetId': target, 'flatten': True})['sessionId']
        browser.call('Page.enable', session=session)
        browser.call('Runtime.enable', session=session)

        def evaluate(expression: str):
            answer = browser.call('Runtime.evaluate', {
                'expression': expression, 'returnByValue': True, 'awaitPromise': True}, session)
            if 'exceptionDetails' in answer:
                print(f'[driver] {expression} threw {answer["exceptionDetails"].get("text")}')
            return answer.get('result', {}).get('value')

        def wait_for(expression: str, seconds: float = 20) -> bool:
            until = time.time() + seconds
            while time.time() < until:
                if evaluate(expression):
                    return True
                time.sleep(0.25)
            return False

        if not wait_for('!!document.querySelector("script")'):
            sys.exit('the origin never loaded')
        if not args.first_run:
            evaluate(SEED)

        for step in args.step:
            what, _, rest = step.partition(' ')
            rest = rest.strip()
            if what == 'go':
                browser.call('Page.navigate', {'url': origin + (rest or '/')}, session)
                if not wait_for('!!document.querySelector(".shell")'):
                    print('[driver] the shell never rendered')
                time.sleep(args.settle)
            elif what == 'waitfor':
                found = wait_for(f'!!document.querySelector({json.dumps(rest)})')
                print(f'waitfor {rest} {"found" if found else "MISSING"}')
            elif what == 'wait':
                time.sleep(float(rest))
            elif what == 'click':
                parts = rest.rsplit(' ', 1)
                times = int(parts[1]) if len(parts) == 2 and parts[1].isdigit() else 1
                selector = parts[0] if times > 1 or (len(parts) == 2 and parts[1].isdigit()) else rest
                print(f'click {selector} x{times}', evaluate(
                    f'(() => {{ const node = document.querySelector({json.dumps(selector)});'
                    f' if (!node) return "MISSING";'
                    f' for (let i = 0; i < {times}; i++)'
                    f'  node.dispatchEvent(new MouseEvent("click", {{ bubbles: true }}));'
                    f' return "clicked"; }})()'))
            elif what == 'type':
                # ` :: ` divides them because both a selector and a value hold spaces.
                selector, _, value = rest.partition(' :: ')
                print(f'type {selector}', evaluate(
                    f'(() => {{ const node = document.querySelector({json.dumps(selector)});'
                    f' if (!node) return "MISSING"; node.value = {json.dumps(value)};'
                    f' node.dispatchEvent(new Event("input", {{ bubbles: true }})); return "typed"; }})()'))
            elif what == 'text':
                print(f'text {rest} ->', evaluate(
                    f'(document.querySelector({json.dumps(rest)}) || {{}}).textContent?.trim() ?? "MISSING"'))
            elif what == 'eval':
                print(f'eval {rest} ->', evaluate(rest))
            elif what == 'media':
                features = [] if rest == 'none' else [{'name': 'prefers-reduced-motion', 'value': rest}]
                browser.call('Emulation.setEmulatedMedia', {'features': features}, session)
                print(f'media {rest}')
            elif what == 'size':
                width, height = rest.split('x')
                browser.call('Emulation.setDeviceMetricsOverride', {
                    'width': int(width), 'height': int(height),
                    'deviceScaleFactor': 1, 'mobile': int(width) < 700}, session)
                print(f'size {rest}')
            elif what == 'shot':
                data = browser.call('Page.captureScreenshot', {'format': 'png'}, session)['data']
                path = os.path.join(SHOTS, rest or 'shot.png')
                with open(path, 'wb') as file:
                    file.write(base64.b64decode(data))
                print(f'shot {path} at {evaluate("location.pathname")}')
            else:
                sys.exit(f'unknown step {step}')

        noise = [event for event in browser.events
                 if event['method'] == 'Runtime.exceptionThrown'
                 or event['params'].get('type') in ('error', 'warning')]
        print(f'[driver] {len(noise)} console errors or exceptions')
        for event in noise[:10]:
            print('   ', json.dumps(event['params'])[:400])
    finally:
        browser.close()
        if vite:
            os.killpg(os.getpgid(vite.pid), signal.SIGTERM)
            print('[driver] stopped the server it started')


if __name__ == '__main__':
    main()
