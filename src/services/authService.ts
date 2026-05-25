import * as vscode from 'vscode';

// ─── Generic multi-service types ─────────────────────────────────────────────

/** A map of field-key → value representing a service's stored credentials. */
export type ServiceCredentials = Record<string, string>;

/** Definition of a single input field required by a service. */
export interface ServiceFieldDef {
  key:         string;
  label:       string;
  placeholder?: string;
  password?:   boolean;
  /** Post-process the raw input value before storing (e.g. strip protocol). */
  transform?:  (value: string) => string;
  validate?:   (value: string) => string | undefined;
}

/** Full definition of an authenticatable service. */
export interface ServiceDefinition {
  id:           string;
  displayName:  string;
  fields:       ServiceFieldDef[];
  /** Builds the HTTP Authorization header for this service given stored credentials. */
  buildAuthHeader?: (credentials: ServiceCredentials) => string;
}

// ─── Built-in service definitions ────────────────────────────────────────────

export const ATLASSIAN_SERVICE: ServiceDefinition = {
  id:          'atlassian',
  displayName: 'Atlassian',
  fields: [
    {
      key:         'domain',
      label:       'Atlassian domain',
      placeholder: 'mycompany.atlassian.net',
      transform:   (v) => v.replace(/^https?:\/\//, '').replace(/\/$/, ''),
      validate:    (v) => v.trim() ? undefined : 'Domain cannot be empty',
    },
    {
      key:         'email',
      label:       'Atlassian account e-mail',
      placeholder: 'user@example.com',
      validate:    (v) => v.includes('@') ? undefined : 'Enter a valid e-mail address',
    },
    {
      key:      'pat',
      label:    'Personal Access Token (PAT)',
      password: true,
      validate: (v) => v.trim() ? undefined : 'PAT cannot be empty',
    },
  ],
  buildAuthHeader: (creds) => {
    const token = Buffer.from(`${creds['email']}:${creds['pat']}`).toString('base64');
    return `Basic ${token}`;
  },
};

// ─── Convenience alias kept for backward-compatibility with AtlassianApiService ─

export interface AtlassianCredentials {
  domain: string;
  email:  string;
  pat:    string;
}

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
export class AuthManager {
  private readonly services = new Map<string, ServiceDefinition>();

  constructor(private readonly secrets: vscode.SecretStorage) {
    this.registerService(ATLASSIAN_SERVICE);
  }

  // ── Service registry ───────────────────────────────────────────────────────

  /** Register a new service definition so AuthManager can manage its credentials. */
  registerService(service: ServiceDefinition): void {
    this.services.set(service.id, service);
  }

  /** Returns all registered service IDs. */
  registeredServices(): string[] {
    return [...this.services.keys()];
  }

  // ── Credential management ──────────────────────────────────────────────────

  /**
   * Returns stored credentials for the given service,
   * or `undefined` if any required field is missing.
   */
  async getCredentials(serviceId: string): Promise<ServiceCredentials | undefined> {
    const service = this.requireService(serviceId);

    const pairs = await Promise.all(
      service.fields.map(async (f): Promise<[string, string | undefined]> => [
        f.key,
        await this.secrets.get(this.storageKey(serviceId, f.key)),
      ])
    );

    if (pairs.some(([, v]) => !v)) {
      return undefined;
    }

    return Object.fromEntries(pairs as [string, string][]);
  }

  /**
   * Returns true if all credential fields for the service are stored.
   */
  async isConfigured(serviceId: string): Promise<boolean> {
    return (await this.getCredentials(serviceId)) !== undefined;
  }

  /**
   * Interactively prompts the user for credentials for the given service
   * and persists them to SecretStorage.
   */
  async setupCredentials(serviceId: string): Promise<ServiceCredentials | undefined> {
    const service = this.requireService(serviceId);
    const total   = service.fields.length;
    const result: ServiceCredentials = {};

    for (let i = 0; i < total; i++) {
      const field = service.fields[i];
      const raw   = await vscode.window.showInputBox({
        title:          `Mimi Assistant — ${service.displayName} (${i + 1} / ${total})`,
        prompt:         field.label,
        placeHolder:    field.placeholder,
        password:       field.password ?? false,
        ignoreFocusOut: true,
        validateInput:  field.validate,
      });

      if (raw === undefined) {
        return undefined;    // user cancelled
      }

      result[field.key] = field.transform ? field.transform(raw.trim()) : raw.trim();
    }

    await Promise.all(
      Object.entries(result).map(([key, value]) =>
        this.secrets.store(this.storageKey(serviceId, key), value)
      )
    );

    vscode.window.showInformationMessage(
      `Mimi Assistant: ${service.displayName} credentials saved.`
    );
    return result;
  }

  /**
   * Clears all stored credentials for a specific service.
   */
  async clearCredentials(serviceId: string): Promise<void> {
    const service = this.requireService(serviceId);

    await Promise.all(
      service.fields.map((f) =>
        this.secrets.delete(this.storageKey(serviceId, f.key))
      )
    );
  }

  /**
   * Directly stores a map of field-key → value for a service.
   * Useful for UI panels that collect all fields at once.
   */
  async storeCredentials(serviceId: string, values: ServiceCredentials): Promise<void> {
    await Promise.all(
      Object.entries(values).map(([key, value]) =>
        this.secrets.store(this.storageKey(serviceId, key), value)
      )
    );
  }

  /**
   * Clears credentials for every registered service.
   */
  async clearAllCredentials(): Promise<void> {
    await Promise.all(
      [...this.services.keys()].map((id) => this.clearCredentials(id))
    );
  }

  // ── Auth header ────────────────────────────────────────────────────────────

  /**
   * Builds the HTTP Authorization header for the given service.
   * Requires the service definition to provide a `buildAuthHeader` function.
   */
  buildAuthHeader(serviceId: string, credentials: ServiceCredentials): string {
    const service = this.requireService(serviceId);
    if (!service.buildAuthHeader) {
      throw new Error(`Service "${serviceId}" does not define buildAuthHeader.`);
    }
    return service.buildAuthHeader(credentials);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private requireService(serviceId: string): ServiceDefinition {
    const service = this.services.get(serviceId);
    if (!service) {
      throw new Error(
        `Unknown service "${serviceId}". ` +
        `Registered: ${[...this.services.keys()].join(', ')}`
      );
    }
    return service;
  }

  private storageKey(serviceId: string, fieldKey: string): string {
    return `mimi.${serviceId}.${fieldKey}`;
  }
}
