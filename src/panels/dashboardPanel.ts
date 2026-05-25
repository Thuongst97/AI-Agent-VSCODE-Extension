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
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;background:#f0f4f8;color:#1e293b;min-height:100vh}

/* ── Header ── */
.header{display:flex;align-items:center;justify-content:space-between;padding:13px 20px;background:#fff;border-bottom:1px solid #e2e8f0;position:sticky;top:0;z-index:10}
.header-left{display:flex;align-items:baseline;gap:10px}
.header-title{font-size:17px;font-weight:700;color:#0f172a}
.header-ts{font-size:11px;color:#94a3b8}
.header-right{display:flex;align-items:center;gap:7px}

/* ── Buttons ── */
.btn{cursor:pointer;font-family:inherit;font-size:12px;font-weight:500;border-radius:20px;padding:6px 13px;display:inline-flex;align-items:center;gap:5px;transition:background .12s,border-color .12s}
.btn-outline{background:#fff;border:1px solid #cbd5e1;color:#334155}
.btn-outline:hover{background:#f8fafc;border-color:#94a3b8}
.btn-icon{background:transparent;border:1px solid #cbd5e1;color:#64748b;border-radius:50%;width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:14px}
.btn-icon:hover{background:#f1f5f9}

/* ── Tabs ── */
.tabs{padding:14px 20px 0;display:flex}
.tab{padding:8px 18px;font-size:12px;font-weight:600;letter-spacing:.5px;cursor:pointer;background:transparent;border:none;color:#64748b;border-radius:6px 6px 0 0;font-family:inherit}
.tab.active{background:#0078D4;color:#fff}
.tab:not(.active):hover{background:#e2e8f0}

/* ── Layout ── */
.main{padding:0 20px 20px}
.card{background:#fff;border-radius:0 8px 8px 8px;box-shadow:0 1px 3px rgba(0,0,0,.07);margin-bottom:12px;overflow:hidden}

/* ── Filters ── */
.filters{padding:12px 14px;display:flex;align-items:stretch;gap:8px;flex-wrap:wrap}
.fc{border:1px solid #e2e8f0;border-radius:6px;padding:8px 11px;min-width:100px;cursor:pointer;background:#fafafa;transition:border-color .12s,background .12s}
.fc:hover:not(.fc-no-hover){border-color:#0078D4;background:#f0f7ff}
.fc-lbl{font-size:10px;font-weight:700;letter-spacing:.5px;color:#94a3b8;display:flex;align-items:center;gap:3px;margin-bottom:3px}
.fc-edit{font-size:9px}
.fc-val{font-size:12px;color:#334155;font-weight:500}
.fc-matched{min-width:80px;border-color:#bfdbfe!important;background:#eff6ff!important;cursor:default!important}
.fc-matched .fc-val{font-size:22px;font-weight:700;color:#0078D4;line-height:1}
.fc-source{min-width:120px;cursor:default}
.fc-source select{border:none;background:transparent;font-size:12px;color:#0078D4;font-weight:600;cursor:pointer;width:100%;padding:0;font-family:inherit;outline:none}

/* ── Status bar ── */
.status-notice{padding:6px 14px 10px;font-size:11px;color:#94a3b8;border-top:1px solid #f1f5f9}
.status-pills{display:flex;flex-wrap:wrap;gap:5px;padding:8px 14px 10px;border-top:1px solid #f1f5f9}
.sp{padding:2px 9px;border-radius:10px;font-size:11px;font-weight:500;cursor:pointer;border:1.5px solid #e2e8f0;color:#64748b;background:#f8fafc;transition:all .12s}
.sp:hover{border-color:#0078D4;color:#0078D4}
.sp.sp-on{border-color:#0078D4;color:#0078D4;background:#eff6ff}

/* ── Table ── */
.issues-table{width:100%;border-collapse:collapse}
.issues-table thead tr{background:#f8fafc}
.issues-table th{text-align:left;padding:9px 14px;font-size:10px;font-weight:700;letter-spacing:.5px;color:#94a3b8;border-bottom:1px solid #e2e8f0}
.issues-table td{padding:9px 14px;font-size:12px;color:#334155;border-bottom:1px solid #f1f5f9;vertical-align:middle}
.issues-table tr:last-child td{border-bottom:none}
.issues-table tbody tr:hover td{background:#f8fafc}
.ikey{color:#0078D4;font-weight:600;cursor:pointer;white-space:nowrap}
.ikey:hover{text-decoration:underline}
.isum{max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* ── Badges ── */
.badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500;white-space:nowrap}
.p-highest,.p-critical{background:#fee2e2;color:#dc2626}
.p-high{background:#ffedd5;color:#ea580c}
.p-medium{background:#fef9c3;color:#ca8a04}
.p-low{background:#dcfce7;color:#16a34a}
.p-lowest,.p-none{background:#f1f5f9;color:#64748b}
.s-done{background:#dcfce7;color:#16a34a}
.s-progress{background:#dbeafe;color:#2563eb}
.s-todo{background:#f1f5f9;color:#64748b}

/* ── States ── */
.sv{padding:36px;text-align:center;color:#94a3b8}
.ec{text-align:center!important;padding:28px!important;color:#94a3b8}
.err-txt{color:#dc2626;font-size:12px}
.spinner{width:26px;height:26px;margin:0 auto 10px;border:3px solid #e2e8f0;border-top-color:#0078D4;border-radius:50%;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}

/* ── Popover ── */
.popover{position:fixed;background:#fff;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);padding:6px;z-index:999;min-width:170px;max-height:240px;overflow-y:auto}
.popover.hidden{display:none!important}
.po{padding:6px 11px;border-radius:4px;cursor:pointer;font-size:12px;color:#334155}
.po:hover{background:#f0f7ff;color:#0078D4}
.po.po-sel{color:#0078D4;font-weight:600}
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
      <button class="btn btn-outline" id="refreshBtn">&#x21BA; Refresh</button>
      <button class="btn-icon" id="settingsBtn" title="Settings">&#9881;</button>
      <button class="btn btn-outline" id="backBtn">&#8592; Back to Chat</button>
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
      <div class="filters">
        <div class="fc" id="fc-assignee">
          <div class="fc-lbl">ASSIGNEE <span class="fc-edit">&#9998;</span></div>
          <div class="fc-val" id="fv-assignee">currentUser().</div>
        </div>
        <div class="fc" id="fc-status">
          <div class="fc-lbl">STATUS <span class="fc-edit">&#9998;</span></div>
          <div class="fc-val" id="fv-status">All statuses</div>
        </div>
        <div class="fc" id="fc-resolution">
          <div class="fc-lbl">RESOLUTION <span class="fc-edit">&#9998;</span></div>
          <div class="fc-val" id="fv-resolution">Any resolution</div>
        </div>
        <div class="fc" id="fc-type">
          <div class="fc-lbl">TYPE <span class="fc-edit">&#9998;</span></div>
          <div class="fc-val" id="fv-type">Any type</div>
        </div>
        <div class="fc fc-source fc-no-hover">
          <div class="fc-lbl">SOURCE</div>
          <select id="srcSelect">
            <option value="JIRA">JIRA</option>
            <option value="HARMONY" disabled>HARMONY</option>
          </select>
        </div>
        <div class="fc fc-matched fc-no-hover">
          <div class="fc-lbl">MATCHED</div>
          <div class="fc-val" id="matchedN">0</div>
        </div>
      </div>
      <div id="sbar" class="status-notice">No issue statuses found in fetched data.</div>
    </div>

    <!-- Table card -->
    <div class="card">
      <div id="lstate" class="sv hidden"><div class="spinner"></div><p>Loading issues&hellip;</p></div>
      <div id="estate" class="sv hidden"><p class="err-txt" id="etxt"></p></div>
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

  // ── Wiring ──
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
      g('popover').classList.add('hidden'); activePop = null;
    }
  });

  function fetch_issues() {
    vscode.postMessage({ type:'fetchIssues', jql: activeTab==='my-issues'?JQL_ME:JQL_TEAM });
  }

  // ── Filter popover ──
  function open_pop(key, chip) {
    const pop = g('popover');
    if (activePop === key) { pop.classList.add('hidden'); activePop=null; return; }
    activePop = key;
    const rect = chip.getBoundingClientRect();
    pop.style.top  = (rect.bottom+4)+'px';
    pop.style.left = rect.left+'px';
    pop.innerHTML  = '';
    pop_options(key).forEach(opt => {
      const d = document.createElement('div');
      d.className = 'po'+(F[key]===opt.value?' po-sel':'');
      d.textContent = opt.label;
      d.onclick = () => { F[key]=opt.value; render_filters(); render_sbar(); render_table(); pop.classList.add('hidden'); activePop=null; };
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

  // ── Filtering ──
  function filter() {
    return issues.filter(i =>
      (F.assignee  ==='__all__' || i.assignee  ===F.assignee)  &&
      (F.status    ==='__all__' || i.status    ===F.status)    &&
      (F.type      ==='__all__' || i.type      ===F.type)      &&
      (F.resolution==='__all__' || i.resolution===F.resolution)
    );
  }

  // ── Render helpers ──
  function render_filters() {
    g('fv-assignee').textContent   = activeTab==='my-issues'?'currentUser().':(F.assignee==='__all__'?'All assignees':F.assignee);
    g('fv-status').textContent     = F.status    ==='__all__'?'All statuses':F.status;
    g('fv-resolution').textContent = F.resolution==='__all__'?'Any resolution':F.resolution;
    g('fv-type').textContent       = F.type      ==='__all__'?'Any type':F.type;
  }

  function render_sbar() {
    const sbar = g('sbar');
    const all = [...new Set(issues.map(i=>i.status))];
    if (!all.length) { sbar.className='status-notice'; sbar.innerHTML='No issue statuses found in fetched data.'; return; }
    sbar.className = 'status-pills';
    sbar.innerHTML = all.map(s=>'<span class="sp'+(F.status===s?' sp-on':'')+'" data-s="'+esc(s)+'">'+esc(s)+'</span>').join('');
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
    g('itbl').classList.toggle('hidden',on);
    g('estate').classList.add('hidden');
  }
  function show_error(msg) {
    g('estate').classList.remove('hidden'); g('etxt').textContent=msg;
    g('itbl').classList.add('hidden'); g('lstate').classList.add('hidden');
  }

  // ── Messages from extension ──
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
