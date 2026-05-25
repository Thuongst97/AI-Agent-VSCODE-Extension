# Role

You are an expert TypeScript developer specializing in VS Code Extension development, specifically utilizing the latest GitHub Copilot Chat APIs (`vscode.chat` and `vscode.lm`).

# Project Overview

I want to build a VS Code extension that contributes a custom Chat Participant (e.g., `@mimi`).
This participant will use the built-in VS Code Language Model API (`vscode.lm`) to borrow the user's active Copilot subscription to process natural language. It will be equipped with "Tools" (function calling) to interact directly with the Jira and Confluence REST APIs.

# Core Requirements & Architecture

## 1. VS Code API Usage

- **Chat Participant:** Register a chat participant using `vscode.chat.createChatParticipant`.
- **Built-in LLM:** Use `vscode.lm.selectChatModels({ vendor: 'copilot' })` to execute the chat prompts. Do NOT use external SDKs like `openai` or require the user to bring their own API keys for the LLM.
- **Tool Calling:** The system prompt must instruct the model to output tool-calling JSON when it needs to interact with Atlassian. You must implement the routing logic to parse the LLM's response, execute the local TypeScript tool functions, and return the result to the LLM.

## 2. Secure Authentication

- **Never hardcode credentials.** \* Use VS Code's native `vscode.SecretStorage` API to prompt the user for, and securely store, their Atlassian domain, email, and Personal Access Token (PAT).
- Create a command (e.g., `atlassianAgent.login`) to handle the setup of these credentials.

## 3. Required Tools (Skills)

Implement the following backend functions that the LLM can call:

1.  `search_jira_issues`: Accepts a JQL string, queries the Jira API, and returns a summary of matching tickets.
2.  `get_issue_details`: Accepts a Jira issue key (e.g., "PROJ-123") and returns the full description, status, and latest comments.
3.  `create_jira_issue`: Accepts a project key, summary, and description to create a new ticket.
4.  `search_confluence`: Accepts a keyword or phrase, searches Confluence spaces, and returns the top 3 matching documentation snippets.

## 4. Execution Flow

1.  User types: `@mimi What is the status of ticket DEV-404?`
2.  Chat handler receives the request, prepends a System Prompt defining the available tools, and sends it to `vscode.lm`.
3.  The LLM responds with a tool call request for `get_issue_details` with args `{"issueKey": "DEV-404"}`.
4.  The extension intercepts this, calls the Jira REST API using the stored credentials, and gets the JSON response.
5.  The extension sends a second request to `vscode.lm` containing the original context + the Jira API JSON result.
6.  The LLM generates a human-readable summary.
7.  The extension streams this summary back to the VS Code Chat UI using `vscode.ChatResponseStream`.

# Step-by-Step Implementation Plan (Please execute this):

1.  **Initialize Project:** Scaffold the `package.json` with the correct `activationEvents` (`onChatParticipant:atlassian`) and `extensionDependencies` (`github.copilot`).
2.  **Auth Module:** Create the utility functions to manage Atlassian credentials via `SecretStorage`.
3.  **API Services:** Write the TypeScript services to perform the raw HTTP `fetch` calls to Jira and Confluence v3 REST APIs.
4.  **Chat Handler:** Implement the `vscode.ChatRequestHandler` logic, including the LLM interaction loop and tool execution routing.
5.  **System Prompt:** Draft a robust system prompt that explains the Jira/Confluence tools to the Copilot model.

Please start by writing the `package.json` and the main `extension.ts` scaffolding. Wait for my approval before implementing the Atlassian API service layer.
