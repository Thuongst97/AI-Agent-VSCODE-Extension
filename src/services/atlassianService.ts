import { AtlassianCredentials } from './authService';

// ─── Jira types ──────────────────────────────────────────────────────────────

interface AdfNode {
  type?: string;
  text?: string;
  content?: AdfNode[];
}

interface JiraIssueFields {
  summary:   string;
  status:    { name: string; statusCategory?: { key: string } };
  assignee:  { displayName: string } | null;
  priority:  { name: string } | null;
  issuetype?: { name: string };
  resolution?: { name: string } | null;
  labels?:   string[];
  created?:  string;
  updated?:  string;
  description?: AdfNode;
  comment?:  {
    comments: Array<{
      author: { displayName: string };
      body:   AdfNode;
      created: string;
    }>;
  };
}

interface JiraIssue {
  key:    string;
  fields: JiraIssueFields;
}

interface JiraSearchResult {
  issues: JiraIssue[];
  total:  number;
}

// ─── Dashboard types ─────────────────────────────────────────────────────────

export interface JiraIssueItem {
  key:            string;
  summary:        string;
  status:         string;
  statusCategory: string;
  priority:       string;
  type:           string;
  assignee:       string;
  resolution:     string;
}

export interface JiraCurrentUser {
  displayName: string;
  username:    string;
}

// ─── Confluence types ────────────────────────────────────────────────────────

interface ConfluencePage {
  id:    string;
  title: string;
  space: { key: string; name: string };
  _links: { webui: string };
  body?: { view: { value: string } };
}

interface ConfluenceSearchResult {
  results: ConfluencePage[];
  totalSize: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * Thin wrapper around the Jira and Confluence v3 REST APIs.
 * All calls use Basic Auth with the stored PAT — no external SDKs needed.
 */
export class AtlassianService {
  private readonly baseUrl:    string;
  private readonly authHeader: string;

  constructor(credentials: AtlassianCredentials) {
    this.baseUrl    = `https://${credentials.domain}`;
    const token     = Buffer.from(`${credentials.email}:${credentials.pat}`).toString('base64');
    this.authHeader = `Basic ${token}`;
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private async fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization:  this.authHeader,
        'Content-Type': 'application/json',
        Accept:         'application/json',
        ...(options.headers as Record<string, string> | undefined),
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Atlassian API error ${response.status} ${response.statusText}: ${body}`);
    }

    return response.json() as Promise<T>;
  }

  /** Recursively extracts plain text from an Atlassian Document Format (ADF) node. */
  private adfToText(node: AdfNode | undefined): string {
    if (!node) return '';
    if (node.type === 'text') return node.text ?? '';
    if (Array.isArray(node.content)) {
      const parts = node.content.map((c) => this.adfToText(c));
      const sep = ['paragraph', 'heading', 'bulletList', 'orderedList', 'listItem'].includes(
        node.type ?? ''
      ) ? '\n' : '';
      return parts.join('') + sep;
    }
    return '';
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // ── Tool: search_jira_issues ─────────────────────────────────────────────

  /**
   * Searches Jira using a JQL query and returns a markdown summary table.
   */
  async searchJiraIssues(jql: string, maxResults = 10): Promise<string> {
    const data = await this.fetchJson<JiraSearchResult>(
      `${this.baseUrl}/rest/api/3/search/jql`,
      {
        method: 'POST',
        body: JSON.stringify({
          jql,
          maxResults,
          fields: ['summary', 'status', 'assignee', 'priority', 'created', 'updated'],
        }),
      }
    );

    if (data.issues.length === 0) {
      return `No Jira issues found for JQL: \`${jql}\``;
    }

    const lines: string[] = [
      `Found **${data.total}** issue(s) (showing ${data.issues.length}):\n`,
      '| Key | Summary | Status | Assignee | Priority |',
      '|-----|---------|--------|----------|----------|',
    ];

    for (const issue of data.issues) {
      const assignee  = issue.fields.assignee?.displayName ?? 'Unassigned';
      const priority  = issue.fields.priority?.name        ?? '—';
      const status    = issue.fields.status.name;
      const summary   = issue.fields.summary.replace(/\|/g, '\\|');
      lines.push(`| ${issue.key} | ${summary} | ${status} | ${assignee} | ${priority} |`);
    }

    return lines.join('\n');
  }

  // ── Tool: get_issue_details ──────────────────────────────────────────────

  /**
   * Retrieves full details for a single Jira issue, including description and
   * the three most recent comments.
   */
  async getIssueDetails(issueKey: string): Promise<string> {
    const params = new URLSearchParams({
      fields: 'summary,status,assignee,priority,description,comment,labels,created,updated',
    });

    const issue = await this.fetchJson<JiraIssue>(
      `${this.baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}?${params}`
    );

    const f           = issue.fields;
    const assignee    = f.assignee?.displayName ?? 'Unassigned';
    const priority    = f.priority?.name        ?? 'None';
    const labels      = f.labels?.join(', ')    || 'None';
    const description = this.adfToText(f.description).trim() || '_No description provided._';

    let result =
      `## ${issue.key}: ${f.summary}\n\n` +
      `| Field    | Value |\n` +
      `|----------|-------|\n` +
      `| Status   | ${f.status.name} |\n` +
      `| Assignee | ${assignee} |\n` +
      `| Priority | ${priority} |\n` +
      `| Labels   | ${labels} |\n\n` +
      `**Description:**\n${description}\n`;

    if (f.comment?.comments?.length) {
      const latest = f.comment.comments.slice(-3);
      result += '\n**Latest Comments:**\n';
      for (const c of latest) {
        const body = this.adfToText(c.body).trim() || '_(empty)_';
        result += `\n> **${c.author.displayName}** (${c.created.slice(0, 10)}):\n> ${body.replace(/\n/g, '\n> ')}\n`;
      }
    }

    return result;
  }

  // ── Tool: create_jira_issue ──────────────────────────────────────────────

  /**
   * Creates a new Jira issue of type "Task" in the given project.
   */
  async createJiraIssue(
    projectKey:  string,
    summary:     string,
    description: string
  ): Promise<string> {
    const body = {
      fields: {
        project:     { key: projectKey.toUpperCase() },
        summary,
        description: {
          type:    'doc',
          version: 1,
          content: [
            {
              type:    'paragraph',
              content: [{ type: 'text', text: description }],
            },
          ],
        },
        issuetype: { name: 'Task' },
      },
    };

    const data = await this.fetchJson<{ key: string }>(
      `${this.baseUrl}/rest/api/3/issue`,
      { method: 'POST', body: JSON.stringify(body) }
    );

    return (
      `Successfully created **${data.key}**.\n` +
      `View it at: ${this.baseUrl}/browse/${data.key}`
    );
  }

  // ── Tool: search_confluence ──────────────────────────────────────────────

  /**
   * Searches Confluence using CQL and returns the top matching page snippets.
   */
  async searchConfluence(query: string, limit = 3): Promise<string> {
    const safeQuery = query.replace(/"/g, '\\"');
    const params    = new URLSearchParams({
      cql:    `type=page AND text~"${safeQuery}" ORDER BY lastmodified DESC`,
      limit:  String(limit),
      expand: 'body.view,space',
    });

    const data = await this.fetchJson<ConfluenceSearchResult>(
      `${this.baseUrl}/wiki/rest/api/content/search?${params}`
    );

    if (!data.results.length) {
      return `No Confluence pages found for: _${query}_`;
    }

    const lines: string[] = [`Found **${data.results.length}** Confluence page(s):\n`];

    for (const page of data.results) {
      const snippet = page.body?.view?.value
        ? this.stripHtml(page.body.view.value).slice(0, 400) + '…'
        : '_No preview available._';
      const link = `${this.baseUrl}/wiki${page._links.webui}`;

      lines.push(
        `### [${page.title}](${link}) — _${page.space.name}_\n` +
        `${snippet}\n`
      );
    }

    return lines.join('\n');
  }

  // ── Dashboard: list issues ────────────────────────────────────────────────

  async getIssuesList(jql: string, maxResults = 50): Promise<JiraIssueItem[]> {
    const data = await this.fetchJson<JiraSearchResult>(
      `${this.baseUrl}/rest/api/3/search/jql`,
      {
        method: 'POST',
        body: JSON.stringify({
          jql,
          maxResults,
          fields: ['summary', 'status', 'assignee', 'priority', 'issuetype', 'resolution'],
        }),
      }
    );

    return data.issues.map((issue) => ({
      key:            issue.key,
      summary:        issue.fields.summary,
      status:         issue.fields.status.name,
      statusCategory: issue.fields.status.statusCategory?.key ?? 'new',
      priority:       issue.fields.priority?.name  ?? 'None',
      type:           issue.fields.issuetype?.name ?? 'Task',
      assignee:       issue.fields.assignee?.displayName ?? 'Unassigned',
      resolution:     issue.fields.resolution?.name ?? 'Unresolved',
    }));
  }

  // ── Dashboard: verify credentials ────────────────────────────────────────

  async verifyCredentials(): Promise<JiraCurrentUser> {
    const data = await this.fetchJson<{
      displayName: string;
      name?:        string;
      emailAddress?: string;
    }>(`${this.baseUrl}/rest/api/3/myself`);

    return {
      displayName: data.displayName,
      username:    data.name ?? data.emailAddress ?? '',
    };
  }
}
