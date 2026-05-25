import * as vscode from 'vscode';
import { AuthManager } from './services/authService';
import { createChatHandler } from './chatHandler';
import { DashboardPanel } from './panels/dashboardPanel';
import { SettingsPanel } from './panels/settingsPanel';
import { SidebarProvider } from './panels/sidebarProvider';

export function activate(context: vscode.ExtensionContext): void {
  const authManager = new AuthManager(context.secrets);

  // ── Sidebar WebView ──────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SidebarProvider.viewType,
      new SidebarProvider(context.extensionUri)
    )
  );

  // ── Commands ────────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('atlassianAgent.login', async () => {
      await authManager.setupCredentials('atlassian');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('atlassianAgent.logout', async () => {
      await authManager.clearCredentials('atlassian');
        vscode.window.showInformationMessage('Mimi Assistant: credentials cleared.');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('atlassianAgent.openDashboard', () => {
      DashboardPanel.createOrShow(context, authManager);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('atlassianAgent.openSettings', () => {
      SettingsPanel.createOrShow(context, authManager);
    })
  );

  // ── Chat participant ─────────────────────────────────────────────────────

  const handler     = createChatHandler(authManager);
  const participant = vscode.chat.createChatParticipant('atlassianAgent.atlassian', handler);

  // Use the packaged PNG as the chat participant avatar so the UI shows the "M" icon
  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'images', 'icon.png');
  participant.followupProvider = {
    provideFollowups(
      _result: vscode.ChatResult,
      _context: vscode.ChatContext,
      _token: vscode.CancellationToken
    ): vscode.ChatFollowup[] {
      return [
        { prompt: 'Show my open Jira issues', label: 'My open issues' },
        { prompt: 'Search Confluence for onboarding documentation', label: 'Confluence search' },
      ];
    },
  };

  context.subscriptions.push(participant);
}

export function deactivate(): void {
  // Nothing to clean up — VS Code disposes subscriptions automatically.
}
