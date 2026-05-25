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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const authService_1 = require("./services/authService");
const chatHandler_1 = require("./chatHandler");
const dashboardPanel_1 = require("./panels/dashboardPanel");
const settingsPanel_1 = require("./panels/settingsPanel");
const sidebarProvider_1 = require("./panels/sidebarProvider");
function activate(context) {
    const authManager = new authService_1.AuthManager(context.secrets);
    // ── Sidebar WebView ──────────────────────────────────────────────────────
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(sidebarProvider_1.SidebarProvider.viewType, new sidebarProvider_1.SidebarProvider(context.extensionUri)));
    // ── Commands ────────────────────────────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('atlassianAgent.login', async () => {
        await authManager.setupCredentials('atlassian');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('atlassianAgent.logout', async () => {
        await authManager.clearCredentials('atlassian');
        vscode.window.showInformationMessage('Mimi Assistant: credentials cleared.');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('atlassianAgent.openDashboard', () => {
        dashboardPanel_1.DashboardPanel.createOrShow(context, authManager);
    }));
    context.subscriptions.push(vscode.commands.registerCommand('atlassianAgent.openSettings', () => {
        settingsPanel_1.SettingsPanel.createOrShow(context, authManager);
    }));
    // ── Chat participant ─────────────────────────────────────────────────────
    const handler = (0, chatHandler_1.createChatHandler)(authManager);
    const participant = vscode.chat.createChatParticipant('atlassianAgent.atlassian', handler);
    // Use the packaged PNG as the chat participant avatar so the UI shows the "M" icon
    participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'images', 'icon.png');
    participant.followupProvider = {
        provideFollowups(_result, _context, _token) {
            return [
                { prompt: 'Show my open Jira issues', label: 'My open issues' },
                { prompt: 'Search Confluence for onboarding documentation', label: 'Confluence search' },
            ];
        },
    };
    context.subscriptions.push(participant);
}
function deactivate() {
    // Nothing to clean up — VS Code disposes subscriptions automatically.
}
//# sourceMappingURL=extension.js.map