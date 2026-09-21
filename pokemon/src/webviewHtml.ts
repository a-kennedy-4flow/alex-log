import * as vscode from "vscode";

export function renderHtml(webview: vscode.Webview, media: vscode.Uri): string {
  const asset = (...parts: string[]) =>
    webview.asWebviewUri(vscode.Uri.joinPath(media, ...parts)).toString();
  const nonce = randomNonce();

  // The libretro glue evaluates strings so it needs unsafe-eval, which also
  // covers WebAssembly.instantiate. blob: covers the core worker and the ROM.
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data: blob:`,
    `media-src ${webview.cspSource} blob:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource}`,
    `script-src ${webview.cspSource} 'nonce-${nonce}' 'unsafe-eval' blob:`,
    "worker-src blob:",
    "child-src blob:",
    `connect-src ${webview.cspSource} blob: data:`,
  ].join("; ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>Game Boy Advance</title>
<style>
  /* VS Code injects its own stylesheet ahead of this one and that stylesheet
     puts horizontal padding on the body. Left unreset it shows as a black bar
     down the left while the right of the picture is clipped away. */
  html, body { height: 100%; margin: 0; padding: 0; background: #000; overflow: hidden; }
  body { display: grid; place-items: center; container-type: size; }
  /* A percentage tracks the padded box. A viewport unit does not. */
  #game { width: 100%; height: 100%; }
  /* The core puts its picture at the top of whatever box it is given rather
     than in the middle of it. So the box is cut to the picture instead and the
     grid above centres it. boot.js sets the ratio once the core reports it. */
  #game.fitted {
    width: min(100cqw, calc(100cqh * var(--aspect)));
    height: min(100cqh, calc(100cqw / var(--aspect)));
  }
  #status {
    position: absolute; inset: 0; display: grid; place-items: center;
    color: var(--vscode-foreground); font: var(--vscode-font-size) var(--vscode-font-family);
  }
</style>
</head>
<body>
  <div id="status">Loading the core</div>
  <div id="game"></div>
  <script nonce="${nonce}">
    window.GBA_DATA_PATH = "${asset("data")}/";
    window.GBA_LOADER = "${asset("data", "loader.js")}";
  </script>
  <script nonce="${nonce}" src="${asset("webview", "boot.js")}"></script>
</body>
</html>`;
}

function randomNonce(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}
