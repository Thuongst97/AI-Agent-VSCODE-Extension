"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsPanel = void 0;
const vscode = __importStar(require("vscode"));
const atlassianService_1 = require("../services/atlassianService");
// ─── Helpers ─────────────────────────────────────────────────────────────────
function getNonce() {
    let text = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return text;
}
// ─── Panel ───────────────────────────────────────────────────────────────────
class SettingsPanel {
    _authManager;
    static currentPanel;
    static viewType = 'mimiSettings';
    _panel;
    _disposables = [];
    // ── Factory ────────────────────────────────────────────────────────────────
    static createOrShow(context, authManager) {
        if (SettingsPanel.currentPanel) {
            SettingsPanel.currentPanel._panel.reveal();
            return;
        }
        const panel = vscode.window.createWebviewPanel(SettingsPanel.viewType, 'Mimi Settings', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
        SettingsPanel.currentPanel = new SettingsPanel(panel, authManager);
    }
    // ── Constructor ────────────────────────────────────────────────────────────
    constructor(panel, _authManager) {
        this._authManager = _authManager;
        this._panel = panel;
        this._panel.webview.html = this._getHtml(getNonce());
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.type) {
                case 'ready':
                    await this._sendCurrentCredentials();
                    break;
                case 'verify':
                    await this._verifyCredentials(msg.email, msg.domain, msg.token);
                    break;
                case 'save':
                    await this._saveCredentials(msg.email, msg.domain, msg.token);
                    break;
                case 'cancel':
                    this.dispose();
                    break;
            }
        }, null, this._disposables);
    }
    // ── Credential helpers ─────────────────────────────────────────────────────
    async _sendCurrentCredentials() {
        const creds = await this._authManager.getCredentials('atlassian');
        this._panel.webview.postMessage({
            type: 'credentials',
            email: creds?.['email'] ?? '',
            domain: creds?.['domain'] ?? '',
            token: creds?.['pat'] ?? '',
        });
    }
    async _verifyCredentials(email, domain, token) {
        try {
            const clean = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
            const svc = new atlassianService_1.AtlassianService({ domain: clean, email, pat: token });
            const user = await svc.verifyCredentials();
            this._panel.webview.postMessage({
                type: 'verifyResult',
                success: true,
                displayName: user.displayName,
                username: user.username,
            });
        }
        catch (err) {
            this._panel.webview.postMessage({
                type: 'verifyResult',
                success: false,
                message: err instanceof Error ? err.message : String(err),
            });
        }
    }
    async _saveCredentials(email, domain, token) {
        try {
            const clean = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
            await this._authManager.storeCredentials('atlassian', {
                email,
                domain: clean,
                pat: token,
            });
            this._panel.webview.postMessage({ type: 'saved' });
            vscode.window.showInformationMessage('Mimi Assistant: credentials saved.');
        }
        catch (err) {
            vscode.window.showErrorMessage(`Mimi Assistant: failed to save — ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    // ── Dispose ────────────────────────────────────────────────────────────────
    dispose() {
        SettingsPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            this._disposables.pop()?.dispose();
        }
    }
    // ── HTML ───────────────────────────────────────────────────────────────────
    _getHtml(nonce) {
        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<title>Mimi Settings</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;background:#f0f4f8;color:#1e293b;min-height:100vh;display:flex;flex-direction:column}

/* ── Page ── */
.page{flex:1;padding:24px 28px 0;overflow-y:auto}

/* ── Accordion ── */
.accordion{background:#fff;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,.08);overflow:hidden;margin-bottom:20px}
.acc-header{display:flex;align-items:center;gap:10px;padding:14px 18px;cursor:pointer;user-select:none;border-left:4px solid #0078D4}
.acc-icon{font-size:16px;color:#0078D4}
.acc-title{font-size:15px;font-weight:600;flex:1;color:#0f172a}
.acc-chevron{color:#0078D4;font-size:13px;transition:transform .2s}
.acc-header.collapsed .acc-chevron{transform:rotate(-90deg)}
.acc-body{border-top:1px solid #f1f5f9}

/* ── Email row ── */
.email-row{display:flex;align-items:center;padding:14px 18px;gap:16px;border-bottom:1px solid #f1f5f9}
.email-row label{font-size:13px;font-weight:500;color:#334155;white-space:nowrap;min-width:130px}
.email-row input{flex:1;max-width:340px;border:1px solid #e2e8f0;border-radius:6px;padding:7px 11px;font-size:13px;color:#1e293b;outline:none;font-family:inherit;transition:border-color .15s}
.email-row input:focus{border-color:#0078D4;box-shadow:0 0 0 2px rgba(0,120,212,.15)}

/* ── Service tabs ── */
.svc-tabs{display:flex;gap:0;padding:0 18px;border-bottom:1px solid #e2e8f0}
.svc-tab{padding:10px 16px;font-size:12px;font-weight:600;letter-spacing:.5px;cursor:pointer;background:transparent;border:none;color:#94a3b8;border-bottom:2px solid transparent;font-family:inherit;transition:color .12s,border-color .12s}
.svc-tab.active{color:#0078D4;border-bottom-color:#0078D4}
.svc-tab:not(.active):hover{color:#334155}

/* ── Service form ── */
.svc-form{padding:0 18px}
.field-row{display:flex;align-items:flex-start;padding:14px 0;gap:16px;border-bottom:1px solid #f1f5f9}
.field-meta{min-width:200px;flex:0 0 200px}
.field-label{font-size:13px;font-weight:500;color:#334155;margin-bottom:3px}
.field-hint{font-size:11px;color:#94a3b8}
.field-hint a{color:#0078D4;text-decoration:none}
.field-hint a:hover{text-decoration:underline}
.field-input{flex:1;max-width:320px;border:1px solid #e2e8f0;border-radius:6px;padding:7px 11px;font-size:13px;color:#1e293b;outline:none;font-family:inherit;transition:border-color .15s}
.field-input:focus{border-color:#0078D4;box-shadow:0 0 0 2px rgba(0,120,212,.15)}

/* ── Verify row ── */
.verify-row{display:flex;align-items:center;justify-content:flex-end;gap:14px;padding:14px 0 16px}
.verify-status{font-size:12px;font-weight:500;flex:1}
.verify-status.ok{color:#16a34a}
.verify-status.fail{color:#dc2626}
.verify-status.checking{color:#94a3b8}

/* ── Buttons ── */
.btn{cursor:pointer;font-family:inherit;font-size:13px;font-weight:500;border-radius:20px;padding:7px 18px;display:inline-flex;align-items:center;gap:5px;border:none;transition:background .12s,opacity .12s}
.btn-primary{background:#0078D4;color:#fff}
.btn-primary:hover{background:#0066b3}
.btn-primary:disabled{opacity:.55;cursor:not-allowed}
.btn-outline{background:#fff;border:1px solid #cbd5e1;color:#334155}
.btn-outline:hover{background:#f8fafc}

/* ── Coming soon ── */
.coming-soon{padding:32px 18px;text-align:center;color:#94a3b8;font-size:13px}

/* ── Footer ── */
.footer{display:flex;justify-content:flex-end;align-items:center;gap:10px;padding:14px 28px;background:#fff;border-top:1px solid #e2e8f0;position:sticky;bottom:0}

/* ── Toast ── */
.toast{position:fixed;bottom:70px;right:24px;background:#16a34a;color:#fff;padding:8px 16px;border-radius:8px;font-size:12px;font-weight:500;box-shadow:0 2px 8px rgba(0,0,0,.15);transition:opacity .3s}
.toast.hidden{opacity:0;pointer-events:none}
</style>
</head>
<body>

<div class="page">
  <!-- Jira Integration accordion -->
  <div class="accordion" id="accordion">
    <div class="acc-header" id="accHeader">
      <span class="acc-icon">&#10697;</span>
      <span class="acc-title">Jira Integration</span>
      <span class="acc-chevron">&#8964;</span>
    </div>
    <div class="acc-body" id="accBody">

      <!-- Shared email field -->
      <div class="email-row">
        <label for="emailInput">Email / User ID</label>
        <input type="email" id="emailInput" placeholder="you@example.com" autocomplete="off">
      </div>

      <!-- JIRA / HARMONY tabs -->
      <div class="svc-tabs">
        <button class="svc-tab active" data-svc="jira">JIRA</button>
        <button class="svc-tab" data-svc="harmony">HARMONY</button>
      </div>

      <!-- JIRA form -->
      <div class="svc-form" id="jiraForm">
        <div class="field-row">
          <div class="field-meta">
            <div class="field-label">Domain</div>
            <div class="field-hint">e.g. https://jira.lge.com</div>
          </div>
          <input type="text" class="field-input" id="domainInput" placeholder="https://your-company.atlassian.net" autocomplete="off">
        </div>
        <div class="field-row">
          <div class="field-meta">
            <div class="field-label">API Token</div>
            <div class="field-hint">Generate in Jira Settings &rarr; Security &rarr; API tokens</div>
          </div>
          <input type="password" class="field-input" id="tokenInput" placeholder="Paste your API token" autocomplete="off">
        </div>
        <div class="verify-row">
          <span class="verify-status" id="vStatus"></span>
          <button class="btn btn-primary" id="verifyBtn">&#10003; Verify Credentials</button>
        </div>
      </div>

      <!-- HARMONY placeholder -->
      <div class="svc-form hidden" id="harmonyForm">
        <p class="coming-soon">HARMONY integration is coming soon.</p>
      </div>

    </div>
  </div>
</div>

<!-- Footer -->
<div class="footer">
  <button class="btn btn-outline" id="cancelBtn">Cancel</button>
  <button class="btn btn-primary" id="saveBtn">Save changes</button>
</div>

<!-- Toast -->
<div class="toast hidden" id="toast">Credentials saved!</div>

<script nonce="${nonce}">
(function(){
  const vscode = acquireVsCodeApi();

  // ── DOM refs ──
  const g = id => document.getElementById(id);
  const emailInput  = g('emailInput');
  const domainInput = g('domainInput');
  const tokenInput  = g('tokenInput');
  const vStatus     = g('vStatus');
  const verifyBtn   = g('verifyBtn');
  const saveBtn     = g('saveBtn');
  const toast       = g('toast');

  // ── Accordion toggle ──
  g('accHeader').onclick = () => {
    g('accHeader').classList.toggle('collapsed');
    g('accBody').style.display = g('accHeader').classList.contains('collapsed') ? 'none' : '';
  };

  // ── Service tabs ──
  document.querySelectorAll('.svc-tab').forEach(t => {
    t.onclick = () => {
      document.querySelectorAll('.svc-tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      const svc = t.dataset.svc;
      g('jiraForm').classList.toggle('hidden', svc !== 'jira');
      g('harmonyForm').classList.toggle('hidden', svc !== 'harmony');
      vStatus.textContent = '';
    };
  });

  // ── Verify ──
  verifyBtn.onclick = () => {
    const email  = emailInput.value.trim();
    const domain = domainInput.value.trim();
    const token  = tokenInput.value.trim();
    if (!email || !domain || !token) {
      vStatus.className = 'verify-status fail';
      vStatus.textContent = 'Please fill in all fields before verifying.';
      return;
    }
    vStatus.className = 'verify-status checking';
    vStatus.textContent = 'Verifying\u2026';
    verifyBtn.disabled = true;
    vscode.postMessage({ type:'verify', email, domain, token });
  };

  // ── Save ──
  saveBtn.onclick = () => {
    const email  = emailInput.value.trim();
    const domain = domainInput.value.trim();
    const token  = tokenInput.value.trim();
    if (!email || !domain || !token) {
      vStatus.className = 'verify-status fail';
      vStatus.textContent = 'Please fill in all fields before saving.';
      g('jiraForm').scrollIntoView({behavior:'smooth'});
      return;
    }
    vscode.postMessage({ type:'save', email, domain, token });
  };

  // ── Cancel ──
  g('cancelBtn').onclick = () => vscode.postMessage({ type:'cancel' });

  // ── Show toast ──
  function show_toast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2800);
  }

  // ── Messages from extension ──
  window.addEventListener('message', e => {
    const m = e.data;

    if (m.type === 'credentials') {
      emailInput.value  = m.email  || '';
      domainInput.value = m.domain ? 'https://'+m.domain : '';
      tokenInput.value  = m.token  || '';
    }

    if (m.type === 'verifyResult') {
      verifyBtn.disabled = false;
      if (m.success) {
        vStatus.className   = 'verify-status ok';
        vStatus.textContent = '\u2713 Verified as ' + m.displayName + ' ' + m.username;
      } else {
        vStatus.className   = 'verify-status fail';
        vStatus.textContent = '\u2717 ' + (m.message || 'Verification failed');
      }
    }

    if (m.type === 'saved') {
      show_toast('Credentials saved successfully!');
    }
  });

  // ── Ready — load existing credentials ──
  vscode.postMessage({ type:'ready' });
})();
</script>
</body>
</html>`;
    }
}
exports.SettingsPanel = SettingsPanel;
//# sourceMappingURL=settingsPanel.js.map