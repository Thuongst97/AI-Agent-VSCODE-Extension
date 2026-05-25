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
exports.AuthManager = exports.ATLASSIAN_SERVICE = void 0;
const vscode = __importStar(require("vscode"));
// ─── Built-in service definitions ────────────────────────────────────────────
exports.ATLASSIAN_SERVICE = {
    id: 'atlassian',
    displayName: 'Atlassian',
    fields: [
        {
            key: 'domain',
            label: 'Atlassian domain',
            placeholder: 'mycompany.atlassian.net',
            transform: (v) => v.replace(/^https?:\/\//, '').replace(/\/$/, ''),
            validate: (v) => v.trim() ? undefined : 'Domain cannot be empty',
        },
        {
            key: 'email',
            label: 'Atlassian account e-mail',
            placeholder: 'user@example.com',
            validate: (v) => v.includes('@') ? undefined : 'Enter a valid e-mail address',
        },
        {
            key: 'pat',
            label: 'Personal Access Token (PAT)',
            password: true,
            validate: (v) => v.trim() ? undefined : 'PAT cannot be empty',
        },
    ],
    buildAuthHeader: (creds) => {
        const token = Buffer.from(`${creds['email']}:${creds['pat']}`).toString('base64');
        return `Basic ${token}`;
    },
};
// ─── AuthManager ─────────────────────────────────────────────────────────────
/**
 * Multi-service credential manager backed by VS Code SecretStorage.
 *
 * Usage:
 *   // Atlassian is pre-registered. Add more services before use:
 *   authManager.registerService(MY_OTHER_SERVICE);
 *
 *   const creds = await authManager.getCredentials('atlassian');
 *   const creds = await authManager.getCredentials('github');
 */
class AuthManager {
    secrets;
    services = new Map();
    constructor(secrets) {
        this.secrets = secrets;
        this.registerService(exports.ATLASSIAN_SERVICE);
    }
    // ── Service registry ───────────────────────────────────────────────────────
    /** Register a new service definition so AuthManager can manage its credentials. */
    registerService(service) {
        this.services.set(service.id, service);
    }
    /** Returns all registered service IDs. */
    registeredServices() {
        return [...this.services.keys()];
    }
    // ── Credential management ──────────────────────────────────────────────────
    /**
     * Returns stored credentials for the given service,
     * or `undefined` if any required field is missing.
     */
    async getCredentials(serviceId) {
        const service = this.requireService(serviceId);
        const pairs = await Promise.all(service.fields.map(async (f) => [
            f.key,
            await this.secrets.get(this.storageKey(serviceId, f.key)),
        ]));
        if (pairs.some(([, v]) => !v)) {
            return undefined;
        }
        return Object.fromEntries(pairs);
    }
    /**
     * Returns true if all credential fields for the service are stored.
     */
    async isConfigured(serviceId) {
        return (await this.getCredentials(serviceId)) !== undefined;
    }
    /**
     * Interactively prompts the user for credentials for the given service
     * and persists them to SecretStorage.
     */
    async setupCredentials(serviceId) {
        const service = this.requireService(serviceId);
        const total = service.fields.length;
        const result = {};
        for (let i = 0; i < total; i++) {
            const field = service.fields[i];
            const raw = await vscode.window.showInputBox({
                title: `Mimi Assistant — ${service.displayName} (${i + 1} / ${total})`,
                prompt: field.label,
                placeHolder: field.placeholder,
                password: field.password ?? false,
                ignoreFocusOut: true,
                validateInput: field.validate,
            });
            if (raw === undefined) {
                return undefined; // user cancelled
            }
            result[field.key] = field.transform ? field.transform(raw.trim()) : raw.trim();
        }
        await Promise.all(Object.entries(result).map(([key, value]) => this.secrets.store(this.storageKey(serviceId, key), value)));
        vscode.window.showInformationMessage(`Mimi Assistant: ${service.displayName} credentials saved.`);
        return result;
    }
    /**
     * Clears all stored credentials for a specific service.
     */
    async clearCredentials(serviceId) {
        const service = this.requireService(serviceId);
        await Promise.all(service.fields.map((f) => this.secrets.delete(this.storageKey(serviceId, f.key))));
    }
    /**
     * Directly stores a map of field-key → value for a service.
     * Useful for UI panels that collect all fields at once.
     */
    async storeCredentials(serviceId, values) {
        await Promise.all(Object.entries(values).map(([key, value]) => this.secrets.store(this.storageKey(serviceId, key), value)));
    }
    /**
     * Clears credentials for every registered service.
     */
    async clearAllCredentials() {
        await Promise.all([...this.services.keys()].map((id) => this.clearCredentials(id)));
    }
    // ── Auth header ────────────────────────────────────────────────────────────
    /**
     * Builds the HTTP Authorization header for the given service.
     * Requires the service definition to provide a `buildAuthHeader` function.
     */
    buildAuthHeader(serviceId, credentials) {
        const service = this.requireService(serviceId);
        if (!service.buildAuthHeader) {
            throw new Error(`Service "${serviceId}" does not define buildAuthHeader.`);
        }
        return service.buildAuthHeader(credentials);
    }
    // ── Helpers ────────────────────────────────────────────────────────────────
    requireService(serviceId) {
        const service = this.services.get(serviceId);
        if (!service) {
            throw new Error(`Unknown service "${serviceId}". ` +
                `Registered: ${[...this.services.keys()].join(', ')}`);
        }
        return service;
    }
    storageKey(serviceId, fieldKey) {
        return `mimi.${serviceId}.${fieldKey}`;
    }
}
exports.AuthManager = AuthManager;
//# sourceMappingURL=authService.js.map