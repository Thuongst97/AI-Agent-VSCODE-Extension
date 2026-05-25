import * as vscode from 'vscode';
import { AuthManager } from './services/authService';
import { AtlassianService } from './services/atlassianService';

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `\
You are an expert Mimi assistant embedded inside VS Code. Your job is to help
developers interact with their Jira projects and Confluence documentation using
natural language.

You have access to the following tools. Call them whenever you need live data —
never fabricate issue details, statuses, or document contents.

Available tools
───────────────
1. search_jira_issues
   - Purpose : Search for Jira issues that match a JQL query.
   - When    : User asks to find, list, or filter issues (e.g. "show me open bugs in DEV").
   - Tip     : Build JQL from the user's intent (project, status, assignee, sprint, etc.).

2. get_issue_details
   - Purpose : Fetch the full description, status, assignee, priority, labels, and the
               three most recent comments for a specific Jira ticket.
   - When    : User asks about a specific issue key (e.g. "what is DEV-404?").

3. create_jira_issue
   - Purpose : Create a new Task-type Jira issue in a given project.
   - When    : User explicitly asks to create or file a ticket.
   - Safety  : Before calling this tool, ALWAYS confirm the projectKey, summary, and
               description with the user in a brief message.

4. search_confluence
   - Purpose : Search Confluence for documentation pages matching a keyword/phrase.
   - When    : User asks about documentation, processes, architecture, or "how to" topics.

Response guidelines
───────────────────
- Use markdown for all responses.
- After receiving a tool result, synthesise it into a clear, human-readable answer.
- If a tool call fails, explain the error and suggest corrective actions (check credentials, verify issue key, etc.).
- For ambiguous requests, ask one focused clarifying question before calling a tool.
- Keep responses concise; use tables and bullet lists for structured data.
`;

// ─── Tool definitions (JSON Schema) ──────────────────────────────────────────

const ATLASSIAN_TOOLS: vscode.LanguageModelChatTool[] = [
  {
    name: 'search_jira_issues',
    description:
      'Search Jira for issues using a JQL query. Returns a markdown table of matching tickets.',
    inputSchema: {
      type: 'object',
      properties: {
        jql: {
          type: 'string',
          description:
            'A valid JQL (Jira Query Language) string, e.g. "project = DEV AND status = Open ORDER BY created DESC".',
        },
      },
      required: ['jql'],
    },
  },
  {
    name: 'get_issue_details',
    description:
      'Fetch full details (status, description, comments) for a single Jira issue by its key.',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'The Jira issue key, e.g. "DEV-404".',
        },
      },
      required: ['issueKey'],
    },
  },
  {
    name: 'create_jira_issue',
    description: 'Create a new Jira Task in the specified project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: {
          type: 'string',
          description: 'The Jira project key, e.g. "DEV".',
        },
        summary: {
          type: 'string',
          description: 'A concise one-line summary / title for the new ticket.',
        },
        description: {
          type: 'string',
          description: 'The detailed description for the new ticket (plain text).',
        },
      },
      required: ['projectKey', 'summary', 'description'],
    },
  },
  {
    name: 'search_confluence',
    description: 'Search Confluence for documentation pages matching a keyword or phrase.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'A keyword or phrase to search for in Confluence.',
        },
      },
      required: ['query'],
    },
  },
];

// ─── Tool executor ────────────────────────────────────────────────────────────

async function executeTool(
  toolCall: vscode.LanguageModelToolCallPart,
  api:      AtlassianService,
  stream:   vscode.ChatResponseStream
): Promise<string> {
  const args = toolCall.input as Record<string, string>;
  stream.progress(`Running tool: ${toolCall.name}…`);

  try {
    switch (toolCall.name) {
      case 'search_jira_issues':
        return await api.searchJiraIssues(args['jql']);
      case 'get_issue_details':
        return await api.getIssueDetails(args['issueKey']);
      case 'create_jira_issue':
        return await api.createJiraIssue(
          args['projectKey'],
          args['summary'],
          args['description']
        );
      case 'search_confluence':
        return await api.searchConfluence(args['query']);
      default:
        return `Unknown tool requested: ${toolCall.name}`;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return `Tool "${toolCall.name}" failed: ${message}`;
  }
}

// ─── Chat handler factory ─────────────────────────────────────────────────────

export function createChatHandler(authManager: AuthManager): vscode.ChatRequestHandler {
  return async (
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream:  vscode.ChatResponseStream,
    token:   vscode.CancellationToken
  ) => {
    // ── 1. Ensure credentials are available ──────────────────────────────
    let credentials = await authManager.getCredentials('atlassian');

    if (!credentials) {
      stream.markdown(
        '**Atlassian credentials not configured.**\n\n' +
        'Please run the command **Mimi Assistant: Configure Credentials** to set your ' +
        'Atlassian domain, e-mail, and Personal Access Token.'
      );

      const choice = await vscode.window.showInformationMessage(
        'Atlassian credentials are required.',
        'Configure Now',
        'Cancel'
      );
      if (choice === 'Configure Now') {
        credentials = await authManager.setupCredentials('atlassian');
      }
      if (!credentials) return;
    }

    const api = new AtlassianService(credentials as unknown as import('./services/authService').AtlassianCredentials);

    // ── 2. Select a Copilot language model ───────────────────────────────
    // Query without a family filter so any active Copilot model works
    // (gpt-4o, claude-sonnet, gemini-flash, etc.)
    const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
    const model  = models[0];

    if (!model) {
      stream.markdown(
        '**No compatible Copilot model found.**\n\n' +
        'Please ensure **GitHub Copilot Chat** is installed and you are signed in.\n\n' +
        `Available models: ${(await vscode.lm.selectChatModels()).map(m => m.id).join(', ') || 'none detected'}`
      );
      return;
    }

    // ── 3. Build the initial message list ───────────────────────────────
    const messages: vscode.LanguageModelChatMessage[] = [
      vscode.LanguageModelChatMessage.User(SYSTEM_PROMPT),
    ];

    // Replay conversation history so the model has context
    for (const turn of context.history) {
      if (turn instanceof vscode.ChatRequestTurn) {
        messages.push(vscode.LanguageModelChatMessage.User(turn.prompt));
      } else if (turn instanceof vscode.ChatResponseTurn) {
        const responseText = turn.response
          .filter((p): p is vscode.ChatResponseMarkdownPart =>
            p instanceof vscode.ChatResponseMarkdownPart
          )
          .map((p) => p.value.value)
          .join('');
        if (responseText.trim()) {
          messages.push(vscode.LanguageModelChatMessage.Assistant(responseText));
        }
      }
    }

    messages.push(vscode.LanguageModelChatMessage.User(request.prompt));

    // ── 4. Agentic tool-calling loop ─────────────────────────────────────
    const MAX_ITERATIONS = 5;

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      if (token.isCancellationRequested) break;

      const lmResponse = await model.sendRequest(
        messages,
        { tools: ATLASSIAN_TOOLS },
        token
      );

      // Collect all parts from this LLM turn, streaming text immediately
      const toolCalls: vscode.LanguageModelToolCallPart[] = [];
      let   textAccumulator = '';

      for await (const part of lmResponse.stream) {
        if (token.isCancellationRequested) break;

        if (part instanceof vscode.LanguageModelTextPart) {
          // Stream each chunk to the UI as it arrives (true streaming)
          stream.markdown(part.value);
          textAccumulator += part.value;
        } else if (part instanceof vscode.LanguageModelToolCallPart) {
          toolCalls.push(part);
        }
      }

      // No tool calls → final answer already streamed chunk-by-chunk above
      if (toolCalls.length === 0) {
        return;
      }

      // Add the assistant's turn (may include a leading thought + tool calls)
      const assistantParts: (vscode.LanguageModelTextPart | vscode.LanguageModelToolCallPart)[] =
        [];
      if (textAccumulator.trim()) {
        assistantParts.push(new vscode.LanguageModelTextPart(textAccumulator));
      }
      assistantParts.push(...toolCalls);
      messages.push(vscode.LanguageModelChatMessage.Assistant(assistantParts));

      // Execute every requested tool and collect results
      const toolResults: vscode.LanguageModelToolResultPart[] = [];
      for (const toolCall of toolCalls) {
        const result = await executeTool(toolCall, api, stream);
        toolResults.push(
          new vscode.LanguageModelToolResultPart(toolCall.callId, [
            new vscode.LanguageModelTextPart(result),
          ])
        );
      }

      // Feed results back to the model as a User turn
      messages.push(vscode.LanguageModelChatMessage.User(toolResults));
    }

    // Safety net — should rarely be reached
    stream.markdown(
      '\n\n> _Reached the maximum number of tool-calling iterations without a final answer._'
    );
  };
}
