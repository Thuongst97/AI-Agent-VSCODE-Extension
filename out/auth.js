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
exports.AuthManager = void 0;
const vscode = __importStar(require("vscode"));
const KEY_DOMAIN = 'atlassian.domain';
const KEY_EMAIL = 'atlassian.email';
const KEY_PAT = 'atlassian.pat';
/**
 * Manages Atlassian credentials using VS Code SecretStorage so that
 * the domain, e-mail, and PAT are never stored in plain-text settings.
 */
class AuthManager {
    secrets;
    constructor(secrets) {
        this.secrets = secrets;
    }
    /** Returns stored credentials, or undefined if any field is missing. */
    async getCredentials() {
        const [domain, email, pat] = await Promise.all([
            this.secrets.get(KEY_DOMAIN),
            this.secrets.get(KEY_EMAIL),
            this.secrets.get(KEY_PAT),
        ]);
        if (!domain || !email || !pat) {
            return undefined;
        }
        return { domain, email, pat };
    }
    /**
     * Interactively prompts the user for their Atlassian credentials and
     * persists them via SecretStorage.
     */
    async setupCredentials() {
        const domain = await vscode.window.showInputBox({
            title: 'Mimi Assistant — Step 1 of 3',
            prompt: 'Enter your Atlassian domain',
            placeHolder: 'mycompany.atlassian.net',
            ignoreFocusOut: true,
            validateInput: (v) => v.trim() ? undefined : 'Domain cannot be empty',
        });
        if (!domain)
            return undefined;
        const email = await vscode.window.showInputBox({
            title: 'Mimi Assistant — Step 2 of 3',
            prompt: 'Enter your Atlassian account e-mail',
            placeHolder: 'user@example.com',
            ignoreFocusOut: true,
            validateInput: (v) => v.includes('@') ? undefined : 'Enter a valid e-mail address',
        });
        if (!email)
            return undefined;
        const pat = await vscode.window.showInputBox({
            title: 'Mimi Assistant — Step 3 of 3',
            prompt: 'Enter your Atlassian Personal Access Token (PAT)',
            password: true,
            ignoreFocusOut: true,
            validateInput: (v) => v.trim() ? undefined : 'PAT cannot be empty',
        });
        if (!pat)
            return undefined;
        const credentials = {
            domain: domain.trim().replace(/^https?:\/\//, '').replace(/\/$/, ''),
            email: email.trim(),
            pat: pat.trim(),
        };
        await Promise.all([
            this.secrets.store(KEY_DOMAIN, credentials.domain),
            this.secrets.store(KEY_EMAIL, credentials.email),
            this.secrets.store(KEY_PAT, credentials.pat),
        ]);
        vscode.window.showInformationMessage('Mimi Assistant credentials saved successfully.');
        return credentials;
    }
    /** Removes all stored credentials. */
    async clearCredentials() {
        await Promise.all([
            this.secrets.delete(KEY_DOMAIN),
            this.secrets.delete(KEY_EMAIL),
            this.secrets.delete(KEY_PAT),
        ]);
    }
    /** Returns a Base64-encoded Basic Auth header value for fetch calls. */
    buildAuthHeader(credentials) {
        const token = Buffer.from(`${credentials.email}:${credentials.pat}`).toString('base64');
        return `Basic ${token}`;
    }
}
exports.AuthManager = AuthManager;
//# sourceMappingURL=auth.js.map