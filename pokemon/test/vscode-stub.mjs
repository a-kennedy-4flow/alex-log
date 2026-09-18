// Stands in for the vscode module so the webview HTML can be rendered outside
// the extension host.
export const Uri = {
  joinPath: (base, ...parts) => ({ path: [base.path, ...parts].join("/") }),
};
