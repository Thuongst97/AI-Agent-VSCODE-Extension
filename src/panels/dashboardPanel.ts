import * as vscode from 'vscode';
import { AuthManager, AtlassianCredentials } from '../services/authService';
import { AtlassianService } from '../services/atlassianService';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) { text += chars.charAt(Math.floor(Math.random() * chars.length)); }
  return text;
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export class DashboardPanel {
  public  static currentPanel: DashboardPanel | undefined;
  private static readonly viewType = 'mimiDashboard';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _disposables: vscode.Disposable[] = [];

  // ── Factory ────────────────────────────────────────────────────────────────

  public static createOrShow(
    context:     vscode.ExtensionContext,
    authManager: AuthManager
  ): void {
    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel._panel.reveal();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      DashboardPanel.viewType,
      'Issue Dashboard',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    DashboardPanel.currentPanel = new DashboardPanel(panel, authManager);
  }

  // ── Constructor ────────────────────────────────────────────────────────────

  private constructor(
    panel:       vscode.WebviewPanel,
    private readonly _authManager: AuthManager
  ) {
    this._panel = panel;
    this._panel.webview.html = this._getHtml(getNonce());

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case 'fetchIssues':
          await this._fetchIssues(msg.jql);
          break;
        case 'openSettings':
          vscode.commands.executeCommand('atlassianAgent.openSettings');
          break;
        case 'backToChat':
          vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus');
          break;
      }
    }, null, this._disposables);
  }

  // ── Data fetching ──────────────────────────────────────────────────────────

  private async _fetchIssues(jql: string): Promise<void> {
    this._panel.webview.postMessage({ type: 'loading' });

    try {
      const creds = await this._authManager.getCredentials('atlassian');
      if (!creds) {
        this._panel.webview.postMessage({
          type: 'error',
          message: 'No credentials configured. Click ⚙ to set up your Jira access.',
        });
        return;
      }

      const service = new AtlassianService(creds as unknown as AtlassianCredentials);
      const issues  = await service.getIssuesList(jql);
      this._panel.webview.postMessage({
        type:      'issuesLoaded',
        issues,
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (err) {
      this._panel.webview.postMessage({
        type:    'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Dispose ────────────────────────────────────────────────────────────────

  public dispose(): void {
    DashboardPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      this._disposables.pop()?.dispose();
    }
  }

  // ── HTML ───────────────────────────────────────────────────────────────────

  private _getHtml(nonce: string): string {
    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<title>Issue Dashboard</title>
<style>
/* ── Reset ── */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow-x:hidden}
body{
  font-family:var(--vscode-font-family,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif);
  font-size:var(--vscode-font-size,13px);
  background:var(--vscode-editor-background);
  color:var(--vscode-editor-foreground);
}

/* ── Header ── */
.header{
  display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;
  padding:10px 16px;
  background:var(--vscode-editorGroupHeader-tabsBackground,var(--vscode-editor-background));
  border-bottom:1px solid var(--vscode-panel-border,var(--vscode-widget-border,#444));
  position:sticky;top:0;z-index:20;
}
.header-left{display:flex;align-items:baseline;gap:8px;min-width:0;flex:1}
.header-title{font-size:15px;font-weight:600;white-space:nowrap}
.header-ts{font-size:11px;color:var(--vscode-descriptionForeground);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.header-right{display:flex;align-items:center;gap:5px;flex-shrink:0}

/* ── Buttons ── */
.btn{
  cursor:pointer;
  font-family:var(--vscode-font-family,inherit);
  font-size:11px;font-weight:500;
  border-radius:3px;padding:5px 10px;
  display:inline-flex;align-items:center;gap:4px;
  white-space:nowrap;border:1px solid transparent;
  transition:opacity .1s,background .1s;
}
.btn-primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground)}
.btn-primary:hover{background:var(--vscode-button-hoverBackground,var(--vscode-button-background));opacity:.9}
.btn-ghost{
  background:transparent;
  color:var(--vscode-editor-foreground);
  border-color:var(--vscode-button-border,var(--vscode-panel-border,var(--vscode-widget-border,#555)));
}
.btn-ghost:hover{background:var(--vscode-toolbar-hoverBackground,var(--vscode-list-hoverBackground))}
.btn-icon{
  background:transparent;
  border:1px solid var(--vscode-button-border,var(--vscode-panel-border,var(--vscode-widget-border,#555)));
  color:var(--vscode-editor-foreground);
  border-radius:3px;width:27px;height:27px;
  display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:13px;
}
.btn-icon:hover{background:var(--vscode-toolbar-hoverBackground,var(--vscode-list-hoverBackground))}

/* ── Tabs ── */
.tabs{
  display:flex;
  padding:0 16px;
  background:var(--vscode-editorGroupHeader-tabsBackground,var(--vscode-editor-background));
  border-bottom:1px solid var(--vscode-panel-border,var(--vscode-widget-border,#444));
}
.tab{
  padding:9px 16px;font-size:12px;font-weight:600;letter-spacing:.4px;
  cursor:pointer;background:transparent;border:none;
  color:var(--vscode-tab-inactiveForeground,var(--vscode-descriptionForeground));
  border-bottom:2px solid transparent;
  font-family:inherit;transition:color .1s,border-color .1s;
}
.tab.active{color:var(--vscode-tab-activeForeground,var(--vscode-editor-foreground));border-bottom-color:var(--vscode-focusBorder,var(--vscode-textLink-foreground,#0078D4))}
.tab:not(.active):hover{color:var(--vscode-editor-foreground);background:var(--vscode-list-hoverBackground)}

/* ── Content ── */
.main{padding:10px 14px 20px}

/* ── Card ── */
.card{
  background:var(--vscode-editorWidget-background,var(--vscode-panel-background,var(--vscode-editor-background)));
  border:1px solid var(--vscode-panel-border,var(--vscode-widget-border,#444));
  border-radius:4px;margin-bottom:10px;overflow:hidden;
}

/* ── Filter bar ── */
.filter-bar{
  display:flex;align-items:center;flex-wrap:wrap;gap:6px;
  padding:10px 14px 8px;
}
.filter-bar-label{
  font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;
  color:var(--vscode-descriptionForeground);margin-right:2px;white-space:nowrap;
}

/* Clickable filter chips */
.fc{
  display:inline-flex;align-items:center;gap:5px;
  padding:0 10px 0 12px;height:28px;
  border-radius:14px;
  border:1px solid var(--vscode-widget-border,var(--vscode-panel-border,#444));
  background:var(--vscode-input-background,rgba(255,255,255,.05));
  cursor:pointer;flex:0 0 auto;
  transition:border-color .15s,background .15s,box-shadow .15s;
  position:relative;
}
.fc:hover:not(.fc-no-hover){
  border-color:var(--vscode-focusBorder,#0078D4);
  background:var(--vscode-list-hoverBackground);
  box-shadow:0 0 0 1px var(--vscode-focusBorder,#0078D4) inset;
}
.fc.fc-active{
  border-color:var(--vscode-textLink-foreground,#0078D4);
  background:color-mix(in srgb,var(--vscode-textLink-foreground,#0078D4) 12%,transparent);
}
.fc-lbl{
  font-size:9px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;
  color:var(--vscode-descriptionForeground);
}
.fc-sep{width:1px;height:12px;background:var(--vscode-widget-border,#555);flex-shrink:0}
.fc-val{
  font-size:11px;font-weight:600;color:var(--vscode-editor-foreground);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100px;
}
.fc-caret{
  font-size:8px;color:var(--vscode-descriptionForeground);flex-shrink:0;margin-left:1px;
  transition:transform .15s;
}
.fc.fc-open .fc-caret{transform:rotate(180deg)}

/* Matched counter chip */
.fc-matched{
  border-color:var(--vscode-textLink-foreground,#0078D4)!important;
  background:color-mix(in srgb,var(--vscode-textLink-foreground,#0078D4) 14%,transparent)!important;
  cursor:default!important;padding:0 12px;
}
.fc-matched .fc-lbl{color:var(--vscode-textLink-foreground,#0078D4)}
.fc-matched .fc-val{
  font-size:16px;font-weight:800;
  color:var(--vscode-textLink-foreground,#0078D4);line-height:1;
}

/* Source chip */
.fc-source{cursor:default;padding:0 10px}
.fc-source select{
  border:none;background:transparent;
  font-size:11px;font-weight:700;letter-spacing:.3px;
  color:var(--vscode-editor-foreground);
  cursor:pointer;padding:0;font-family:inherit;outline:none;max-width:80px;
}

/* ── Status bar ── */
.status-notice{
  padding:4px 14px 8px;font-size:11px;
  color:var(--vscode-descriptionForeground);
  border-top:1px solid var(--vscode-panel-border,var(--vscode-widget-border,#444));
  font-style:italic;
}
.status-pills{
  display:flex;align-items:center;flex-wrap:wrap;gap:5px;
  padding:7px 14px 9px;
  border-top:1px solid var(--vscode-panel-border,var(--vscode-widget-border,#444));
}
.status-pills-label{
  font-size:9px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;
  color:var(--vscode-descriptionForeground);margin-right:3px;
}
.sp{
  display:inline-flex;align-items:center;gap:4px;
  padding:2px 9px;border-radius:10px;font-size:10px;font-weight:600;cursor:pointer;
  border:1px solid var(--vscode-widget-border,#555);
  color:var(--vscode-descriptionForeground);
  background:transparent;
  transition:border-color .12s,color .12s,background .12s;
  letter-spacing:.2px;
}
.sp:hover{
  border-color:var(--vscode-focusBorder,#0078D4);
  color:var(--vscode-editor-foreground);
  background:var(--vscode-list-hoverBackground);
}
.sp.sp-on{
  border-color:var(--vscode-textLink-foreground,#0078D4);
  color:var(--vscode-textLink-foreground,#0078D4);
  background:color-mix(in srgb,var(--vscode-textLink-foreground,#0078D4) 12%,transparent);
}
.sp-dot{
  width:6px;height:6px;border-radius:50%;
  background:currentColor;opacity:.7;flex-shrink:0;
}

/* ── Table ── */
.table-wrap{overflow-x:auto;width:100%;-webkit-overflow-scrolling:touch}
.issues-table{width:100%;border-collapse:collapse;min-width:520px}
.issues-table thead tr{background:var(--vscode-keybindingTable-headerBackground,transparent)}
.issues-table th{
  text-align:left;padding:8px 12px;font-size:10px;font-weight:700;letter-spacing:.6px;
  color:var(--vscode-descriptionForeground);
  border-bottom:1px solid var(--vscode-panel-border,var(--vscode-widget-border,#444));
  white-space:nowrap;
}
.issues-table td{
  padding:8px 12px;font-size:12px;color:var(--vscode-editor-foreground);
  border-bottom:1px solid var(--vscode-list-inactiveSelectionBackground,var(--vscode-panel-border,var(--vscode-widget-border,#444)));
  vertical-align:middle;
}
.issues-table tr:last-child td{border-bottom:none}
.issues-table tbody tr:hover td{background:var(--vscode-list-hoverBackground)}
.ikey{color:var(--vscode-textLink-foreground,#0078D4);font-weight:600;cursor:pointer;white-space:nowrap}
.ikey:hover{text-decoration:underline}
.isum{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:clamp(140px,30vw,320px);display:block}

/* ── Badges ── */
.badge{display:inline-flex;align-items:center;padding:1px 7px;border-radius:10px;font-size:10px;font-weight:600;white-space:nowrap}
.p-highest,.p-critical{color:var(--vscode-editorError-foreground,#f14c4c);border:1px solid var(--vscode-editorError-foreground,#f14c4c)}
.p-high{color:var(--vscode-editorWarning-foreground,#cca700);border:1px solid var(--vscode-editorWarning-foreground,#cca700)}
.p-medium{background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}
.p-low{color:var(--vscode-terminal-ansiGreen,#89d185);border:1px solid var(--vscode-terminal-ansiGreen,#89d185)}
.p-lowest,.p-none{color:var(--vscode-descriptionForeground);border:1px solid var(--vscode-widget-border,#555)}
.s-done{color:var(--vscode-terminal-ansiGreen,#89d185);border:1px solid var(--vscode-terminal-ansiGreen,#89d185)}
.s-progress{background:var(--vscode-badge-background);color:var(--vscode-badge-foreground)}
.s-todo{color:var(--vscode-descriptionForeground);border:1px solid var(--vscode-widget-border,#555)}

/* ── States ── */
.sv{padding:32px 16px;text-align:center;color:var(--vscode-descriptionForeground)}
.ec{text-align:center!important;padding:28px!important;color:var(--vscode-descriptionForeground)}
.err-txt{color:var(--vscode-editorError-foreground,#f14c4c);font-size:12px}
.spinner{
  width:22px;height:22px;margin:0 auto 10px;
  border:2px solid var(--vscode-widget-border,#444);
  border-top-color:var(--vscode-textLink-foreground,#0078D4);
  border-radius:50%;animation:spin .7s linear infinite;
}
@keyframes spin{to{transform:rotate(360deg)}}

/* ── Popover ── */
.popover{
  position:fixed;
  background:var(--vscode-editorWidget-background,var(--vscode-dropdown-background,#252526));
  border:1px solid var(--vscode-panel-border,var(--vscode-widget-border,#454545));
  border-radius:4px;box-shadow:0 4px 14px rgba(0,0,0,.4);
  padding:4px;z-index:999;min-width:160px;max-height:220px;overflow-y:auto;
}
.popover.hidden{display:none!important}
.po{padding:5px 10px;border-radius:2px;cursor:pointer;font-size:12px;color:var(--vscode-editor-foreground)}
.po:hover{background:var(--vscode-list-hoverBackground)}
.po.po-sel{color:var(--vscode-textLink-foreground,#0078D4);font-weight:600}
.hidden{display:none!important}
</style>
</head>
<body>
<div id="app">

  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <span class="header-title">Issue Dashboard</span>
      <span class="header-ts" id="hts"></span>
    </div>
    <div class="header-right">
      <button class="btn btn-ghost" id="refreshBtn">&#x21BA; Refresh</button>
      <button class="btn-icon" id="settingsBtn" title="Open Settings">&#9881;</button>
      <button class="btn btn-ghost" id="backBtn">&#8592; Back to Chat</button>
    </div>
  </div>

  <!-- Tabs -->
  <div class="tabs">
    <button class="tab active" data-tab="my-issues">MY ISSUES</button>
    <button class="tab" data-tab="my-team">MY TEAM</button>
  </div>

  <div class="main">

    <!-- Filters card -->
    <div class="card">
      <div class="filter-bar">
        <span class="filter-bar-label">Filter</span>

        <div class="fc" id="fc-assignee">
          <span class="fc-lbl">ASSIGNEE</span>
          <span class="fc-sep"></span>
          <span class="fc-val" id="fv-assignee">currentUser().</span>
          <span class="fc-caret">&#9660;</span>
        </div>

        <div class="fc" id="fc-status">
          <span class="fc-lbl">STATUS</span>
          <span class="fc-sep"></span>
          <span class="fc-val" id="fv-status">All</span>
          <span class="fc-caret">&#9660;</span>
        </div>

        <div class="fc" id="fc-resolution">
          <span class="fc-lbl">RESOLUTION</span>
          <span class="fc-sep"></span>
          <span class="fc-val" id="fv-resolution">Any</span>
          <span class="fc-caret">&#9660;</span>
        </div>

        <div class="fc" id="fc-type">
          <span class="fc-lbl">TYPE</span>
          <span class="fc-sep"></span>
          <span class="fc-val" id="fv-type">Any</span>
          <span class="fc-caret">&#9660;</span>
        </div>

        <div class="fc fc-source fc-no-hover">
          <span class="fc-lbl">SOURCE</span>
          <span class="fc-sep"></span>
          <select id="srcSelect">
            <option value="JIRA">JIRA</option>
            <option value="HARMONY" disabled>HARMONY</option>
          </select>
        </div>

        <div class="fc fc-matched fc-no-hover">
          <span class="fc-lbl">MATCHED</span>
          <span class="fc-val" id="matchedN">0</span>
        </div>
      </div>
      <div id="sbar" class="status-notice">No issue statuses found in fetched data.</div>
    </div>

    <!-- Table card -->
    <div class="card">
      <div id="lstate" class="sv hidden"><div class="spinner"></div><p>Loading issues&hellip;</p></div>
      <div id="estate" class="sv hidden"><p class="err-txt" id="etxt"></p></div>
      <div class="table-wrap">
        <table class="issues-table" id="itbl">
          <thead><tr>
            <th>TICKET</th><th>SUMMARY</th><th>TYPE</th><th>PRIORITY</th><th>STATUS</th>
          </tr></thead>
          <tbody id="itbody">
            <tr><td class="ec" colspan="5">No issues match the selected filters.</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Filter popover -->
  <div class="popover hidden" id="popover"></div>
</div>

<script nonce="${nonce}">
(function(){
  const vscode = acquireVsCodeApi();
  let issues = [], activeTab = 'my-issues', activePop = null;
  let F = { assignee:'__all__', status:'__all__', resolution:'__all__', type:'__all__' };

  const JQL_ME   = 'assignee = currentUser() ORDER BY updated DESC';
  const JQL_TEAM = 'assignee != currentUser() AND assignee is not EMPTY ORDER BY updated DESC';

  const g = id => document.getElementById(id);

  g('refreshBtn').onclick  = () => fetch_issues();
  g('settingsBtn').onclick = () => vscode.postMessage({type:'openSettings'});
  g('backBtn').onclick     = () => vscode.postMessage({type:'backToChat'});

  document.querySelectorAll('.tab').forEach(t => {
    t.onclick = () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      activeTab = t.dataset.tab;
      issues = [];
      F = { assignee:'__all__', status:'__all__', resolution:'__all__', type:'__all__' };
      render_filters(); fetch_issues();
    };
  });

  ['assignee','status','resolution','type'].forEach(k => {
    g('fc-'+k).onclick = e => open_pop(k, e.currentTarget);
  });

  document.addEventListener('click', e => {
    if (!g('popover').contains(e.target) && !e.target.closest('.fc')) {
      close_pop();
    }
  });

  function fetch_issues() {
    vscode.postMessage({ type:'fetchIssues', jql: activeTab==='my-issues'?JQL_ME:JQL_TEAM });
  }

  function close_pop() {
    const pop = g('popover');
    pop.classList.add('hidden');
    if (activePop) { g('fc-'+activePop)?.classList.remove('fc-open','fc-active'); }
    activePop = null;
  }

  function open_pop(key, chip) {
    const pop = g('popover');
    if (activePop === key) { close_pop(); return; }
    if (activePop) close_pop();
    activePop = key;
    chip.classList.add('fc-open','fc-active');
    const rect = chip.getBoundingClientRect();
    pop.style.top  = (rect.bottom+5)+'px';
    pop.style.left = rect.left+'px';
    pop.innerHTML  = '';
    pop_options(key).forEach(opt => {
      const d = document.createElement('div');
      d.className = 'po'+(F[key]===opt.value?' po-sel':'');
      d.textContent = opt.label;
      d.onclick = () => { F[key]=opt.value; render_filters(); render_sbar(); render_table(); close_pop(); };
      pop.appendChild(d);
    });
    pop.classList.remove('hidden');
  }

  function pop_options(key) {
    if (key==='assignee') {
      const u = [...new Set(issues.map(i=>i.assignee))].sort();
      return [{label:'All assignees',value:'__all__'},...u.map(a=>({label:a,value:a}))];
    }
    if (key==='status') {
      const s = [...new Set(issues.map(i=>i.status))].sort();
      return [{label:'All statuses',value:'__all__'},...s.map(s=>({label:s,value:s}))];
    }
    if (key==='resolution') {
      return [{label:'Any resolution',value:'__all__'},{label:'Unresolved',value:'Unresolved'},{label:'Resolved',value:'Resolved'},{label:'Done',value:'Done'},{label:'Fixed',value:'Fixed'}];
    }
    if (key==='type') {
      const t = [...new Set(issues.map(i=>i.type))].sort();
      return [{label:'Any type',value:'__all__'},...t.map(t=>({label:t,value:t}))];
    }
    return [];
  }

  function filter() {
    return issues.filter(i =>
      (F.assignee  ==='__all__' || i.assignee  ===F.assignee)  &&
      (F.status    ==='__all__' || i.status    ===F.status)    &&
      (F.type      ==='__all__' || i.type      ===F.type)      &&
      (F.resolution==='__all__' || i.resolution===F.resolution)
    );
  }

  function render_filters() {
    const trunc = (s,n=14) => s.length>n?s.slice(0,n-1)+'…':s;
    g('fv-assignee').textContent   = activeTab==='my-issues'?'Me':(F.assignee==='__all__'?'All':trunc(F.assignee));
    g('fv-status').textContent     = F.status    ==='__all__'?'All':trunc(F.status);
    g('fv-resolution').textContent = F.resolution==='__all__'?'Any':trunc(F.resolution);
    g('fv-type').textContent       = F.type      ==='__all__'?'Any':trunc(F.type);
    // highlight active chips
    ['assignee','status','resolution','type'].forEach(k => {
      const el = g('fc-'+k);
      if (!el) return;
      const active = k==='assignee' ? activeTab!=='my-issues' && F[k]!=='__all__' : F[k]!=='__all__';
      el.classList.toggle('fc-active', active && activePop!==k);
    });
  }

  function render_sbar() {
    const sbar = g('sbar');
    const all = [...new Set(issues.map(i=>i.status))];
    if (!all.length) { sbar.className='status-notice'; sbar.innerHTML='No issue statuses found in fetched data.'; return; }
    sbar.className = 'status-pills';
    sbar.innerHTML = '<span class="status-pills-label">Status</span>' + all.map(s=>'<span class="sp'+(F.status===s?' sp-on':'')+' " data-s="'+esc(s)+'"><span class="sp-dot"></span>'+esc(s)+'</span>').join('');
    sbar.querySelectorAll('.sp').forEach(p => {
      p.onclick = () => { F.status = F.status===p.dataset.s?'__all__':p.dataset.s; render_filters(); render_sbar(); render_table(); };
    });
  }

  function render_table() {
    const rows = filter();
    g('matchedN').textContent = rows.length;
    if (!rows.length) { g('itbody').innerHTML='<tr><td class="ec" colspan="5">No issues match the selected filters.</td></tr>'; return; }
    g('itbody').innerHTML = rows.map(i =>
      '<tr>' +
      '<td><span class="ikey">'+esc(i.key)+'</span></td>' +
      '<td><span class="isum" title="'+esc(i.summary)+'">'+esc(i.summary)+'</span></td>' +
      '<td>'+esc(i.type)+'</td>' +
      '<td><span class="badge '+pclass(i.priority)+'">'+esc(i.priority)+'</span></td>' +
      '<td><span class="badge '+sclass(i.status,i.statusCategory)+'">'+esc(i.status)+'</span></td>' +
      '</tr>'
    ).join('');
  }

  function pclass(p) {
    const m={Highest:'p-highest',Critical:'p-critical',High:'p-high',Medium:'p-medium',Low:'p-low',Lowest:'p-lowest'};
    return m[p]||'p-none';
  }
  function sclass(s,cat) {
    if (cat==='done') return 's-done';
    if (cat==='indeterminate') return 's-progress';
    const lc=s.toLowerCase().replace(/\s+/g,'');
    if (lc==='done'||lc==='closed'||lc==='resolved') return 's-done';
    if (lc.includes('progress')||lc.includes('review')) return 's-progress';
    return 's-todo';
  }
  function esc(v) { return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function show_loading(on) {
    g('lstate').classList.toggle('hidden',!on);
    g('itbl').closest('.table-wrap').classList.toggle('hidden',on);
    g('estate').classList.add('hidden');
  }
  function show_error(msg) {
    g('estate').classList.remove('hidden'); g('etxt').textContent=msg;
    g('itbl').closest('.table-wrap').classList.add('hidden');
    g('lstate').classList.add('hidden');
  }

  window.addEventListener('message', e => {
    const m = e.data;
    if (m.type==='loading')      { show_loading(true); }
    if (m.type==='issuesLoaded') { show_loading(false); issues=m.issues; g('hts').textContent='Last updated '+m.timestamp; render_sbar(); render_filters(); render_table(); }
    if (m.type==='error')        { show_error(m.message); }
  });

  fetch_issues();
})();
</script>
</body>
</html>`;
  }
}
