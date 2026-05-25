import * as vscode from 'vscode';

const KEY_DOMAIN = 'atlassian.domain';
const KEY_EMAIL  = 'atlassian.email';
const KEY_PAT    = 'atlassian.pat';

export interface AtlassianCredentials {
  domain: string;
  email:  string;
  pat:    string;
}

/**
 * Manages Atlassian credentials using VS Code SecretStorage so that
 * the domain, e-mail, and PAT are never stored in plain-text settings.
 */
export class AuthManager {
  constructor(private readonly secrets: vscode.SecretStorage) {}

  /** Returns stored credentials, or undefined if any field is missing. */
  async getCredentials(): Promise<AtlassianCredentials | undefined> {
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
  async setupCredentials(): Promise<AtlassianCredentials | undefined> {
    const domain = await vscode.window.showInputBox({
      title: 'Mimi Assistant — Step 1 of 3',
      prompt: 'Enter your Atlassian domain',
      placeHolder: 'mycompany.atlassian.net',
      ignoreFocusOut: true,
      validateInput: (v) => v.trim() ? undefined : 'Domain cannot be empty',
    });
    if (!domain) return undefined;

    const email = await vscode.window.showInputBox({
      title: 'Mimi Assistant — Step 2 of 3',
      prompt: 'Enter your Atlassian account e-mail',
      placeHolder: 'user@example.com',
      ignoreFocusOut: true,
      validateInput: (v) => v.includes('@') ? undefined : 'Enter a valid e-mail address',
    });
    if (!email) return undefined;

    const pat = await vscode.window.showInputBox({
      title: 'Mimi Assistant — Step 3 of 3',
      prompt: 'Enter your Atlassian Personal Access Token (PAT)',
      password: true,
      ignoreFocusOut: true,
      validateInput: (v) => v.trim() ? undefined : 'PAT cannot be empty',
    });
    if (!pat) return undefined;

    const credentials: AtlassianCredentials = {
      domain: domain.trim().replace(/^https?:\/\//, '').replace(/\/$/, ''),
      email:  email.trim(),
      pat:    pat.trim(),
    };

    await Promise.all([
      this.secrets.store(KEY_DOMAIN, credentials.domain),
      this.secrets.store(KEY_EMAIL,  credentials.email),
      this.secrets.store(KEY_PAT,    credentials.pat),
    ]);

    vscode.window.showInformationMessage('Mimi Assistant credentials saved successfully.');
    return credentials;
  }

  /** Removes all stored credentials. */
  async clearCredentials(): Promise<void> {
    await Promise.all([
      this.secrets.delete(KEY_DOMAIN),
      this.secrets.delete(KEY_EMAIL),
      this.secrets.delete(KEY_PAT),
    ]);
  }

  /** Returns a Base64-encoded Basic Auth header value for fetch calls. */
  buildAuthHeader(credentials: AtlassianCredentials): string {
    const token = Buffer.from(`${credentials.email}:${credentials.pat}`).toString('base64');
    return `Basic ${token}`;
  }
}
