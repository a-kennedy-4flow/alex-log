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
  html, body { height: 100%; margin: 0; background: #000; overflow: hidden; }
  #game { width: 100vw; height: 100vh; }
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
