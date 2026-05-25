# Mimi Assistant — VS Code Extension

A VS Code Chat Participant (`@mimi`) that lets you interact with **Jira** and **Confluence** in natural language, powered by your existing GitHub Copilot subscription.

---

## Prerequisites

| Tool                | Version | Install                       |
| ------------------- | ------- | ----------------------------- |
| Node.js             | ≥ 18    | https://nodejs.org            |
| npm                 | ≥ 9     | bundled with Node             |
| VS Code             | ≥ 1.90  | https://code.visualstudio.com |
| GitHub Copilot Chat | latest  | VS Code Marketplace           |
| `vsce` (packager)   | latest  | `npm install -g @vscode/vsce` |

---

## 1 — Clone & install dependencies

```bash
git clone <repo-url>
cd AI-Agent-VSCODE-Extension
npm install
```

---

## 2 — Compile TypeScript

```bash
npm run compile
```

Compiled output is written to `out/`. To watch for changes during development:

```bash
npm run watch
```

---

## 3 — Run & debug in VS Code (development)

1. Open the project folder in VS Code.
2. Press **F5** (or **Run → Start Debugging**).
   VS Code opens an **Extension Development Host** window with the extension loaded.
3. In the new window, open **Copilot Chat** and type `@mimi hello`.

> A `.vscode/launch.json` is required for F5 to work. Create it if it doesn't exist:

```jsonc
// .vscode/launch.json
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Run Extension",
            "type": "extensionHost",
            "request": "launch",
            "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
            "outFiles": ["${workspaceFolder}/out/**/*.js"],
            "preLaunchTask": "${defaultBuildTask}",
        },
    ],
}
```

```jsonc
// .vscode/tasks.json
{
    "version": "2.0.0",
    "tasks": [
        {
            "type": "npm",
            "script": "watch",
            "problemMatcher": "$tsc-watch",
            "isBackground": true,
            "presentation": { "reveal": "never" },
            "group": { "kind": "build", "isDefault": true },
        },
    ],
}
```

---

## 4 — Package the extension (.vsix)

A `.vsix` file is a self-contained installable bundle.

### 4.1 Install the packager (once)

```bash
npm install -g @vscode/vsce
```

### 4.2 Set a publisher in package.json (required by vsce)

Open `package.json` and set `"publisher"` to any identifier (no spaces):

```json
"publisher": "your-publisher-id"
```

### 4.3 Build the package

```bash
# Compile first, then package
npm run compile
vsce package
```

This produces a file like **`atlassian-agent-0.0.1.vsix`** in the project root.

> **Tip:** `vsce package --no-dependencies` skips bundling `node_modules` (safe here since there are no runtime dependencies).

---

## 5 — Install the .vsix in VS Code

**Option A — Command Palette:**

1. Open VS Code.
2. Press `Ctrl+Shift+P` → **Extensions: Install from VSIX…**
3. Select the `.vsix` file.

**Option B — Terminal:**

```bash
code --install-extension atlassian-agent-0.0.1.vsix
```

Reload VS Code when prompted.

---

## 6 — Configure Atlassian credentials

The extension never stores credentials in plain text. It uses VS Code's encrypted `SecretStorage`.

1. Press `Ctrl+Shift+P` → **Mimi Assistant: Configure Credentials**
2. Enter your:
    - **Domain** — e.g. `mycompany.atlassian.net`
    - **Email** — your Atlassian account e-mail
    - **PAT** — a Personal Access Token ([create one here](https://id.atlassian.com/manage-profile/security/api-tokens))

To clear credentials: `Ctrl+Shift+P` → **Mimi Assistant: Clear Credentials**

---

## 7 — Usage

Open **Copilot Chat** (`Ctrl+Alt+I`) and mention `@mimi`:

| Example prompt                                            | What happens               |
| --------------------------------------------------------- | -------------------------- |
| `@mimi What is the status of DEV-404?`                    | Fetches full issue details |
| `@mimi Show all open bugs assigned to me in PROJECT`      | Runs a JQL search          |
| `@mimi Create a ticket in DEV for a login page bug`       | Creates a new Jira Task    |
| `@mimi Find Confluence docs about the deployment process` | Searches Confluence        |

---

## 8 — Project structure

```
src/
├── extension.ts      # Activation, command & participant registration
├── auth.ts           # SecretStorage credential manager
├── atlassianApi.ts   # Jira & Confluence REST API calls
└── chatHandler.ts    # LLM agentic loop, tool routing, system prompt
out/                  # Compiled JavaScript (generated — do not edit)
package.json
tsconfig.json
```

---

## 9 — Publish to the Marketplace (optional)

```bash
# Log in with a Personal Access Token from dev.azure.com
vsce login <publisher-id>

# Publish
vsce publish
```

See the [VS Code Publishing Guide](https://code.visualstudio.com/api/working-extension/publishing-extension) for full details.
