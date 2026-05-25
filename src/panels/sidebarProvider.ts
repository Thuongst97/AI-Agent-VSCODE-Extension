import * as vscode from 'vscode';

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) { text += chars.charAt(Math.floor(Math.random() * chars.length)); }
  return text;
}

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'mimiAssistant.sidebar';

  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _ctx: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtml(getNonce());

    webviewView.webview.onDidReceiveMessage((msg) => {
      switch (msg.type) {
        case 'openDashboard':
          vscode.commands.executeCommand('atlassianAgent.openDashboard');
          break;
        case 'openSettings':
          vscode.commands.executeCommand('atlassianAgent.openSettings');
          break;
      }
    });
  }

  private _getHtml(nonce: string): string {
    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body {
    padding: 12px;
    font-family: var(--vscode-font-family, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-foreground);
    background: transparent;
  }
  .desc {
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 16px;
    line-height: 1.5;
  }
  .desc code {
    background: var(--vscode-textCodeBlock-background);
    padding: 1px 4px;
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family, monospace);
  }
  .btn {
    display: block;
    width: 100%;
    padding: 8px 12px;
    margin-bottom: 8px;
    border: none;
    border-radius: 3px;
    font-size: 13px;
    font-family: inherit;
    cursor: pointer;
    text-align: center;
  }
  .btn-primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
  .btn-secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .divider { border: none; border-top: 1px solid var(--vscode-widget-border, #444); margin: 14px 0; }
  .section-title {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground));
    margin-bottom: 8px;
    opacity: 0.7;
  }
</style>
</head>
<body>
  <p class="desc">Use <code>@mimi</code> in Copilot Chat to search Jira and Confluence.</p>

  <div class="section-title">Dashboard</div>
  <button class="btn btn-primary" id="dashBtn">&#128196; Open Issue Dashboard</button>

  <hr class="divider">

  <div class="section-title">Configuration</div>
  <button class="btn btn-secondary" id="settingsBtn">&#9881; Open Settings</button>

<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  document.getElementById('dashBtn').onclick    = () => vscode.postMessage({ type: 'openDashboard' });
  document.getElementById('settingsBtn').onclick = () => vscode.postMessage({ type: 'openSettings' });
</script>
</body>
</html>`;
  }
}
