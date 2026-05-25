"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AtlassianApiService = void 0;
// ─── Service ─────────────────────────────────────────────────────────────────
/**
 * Thin wrapper around the Jira and Confluence v3 REST APIs.
 * All calls use Basic Auth with the stored PAT — no external SDKs needed.
 */
class AtlassianApiService {
    baseUrl;
    authHeader;
    constructor(credentials) {
        this.baseUrl = `https://${credentials.domain}`;
        const token = Buffer.from(`${credentials.email}:${credentials.pat}`).toString('base64');
        this.authHeader = `Basic ${token}`;
    }
    // ── Private helpers ─────────────────────────────────────────────────────
    async fetchJson(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            headers: {
                Authorization: this.authHeader,
                'Content-Type': 'application/json',
                Accept: 'application/json',
                ...options.headers,
            },
        });
        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(`Atlassian API error ${response.status} ${response.statusText}: ${body}`);
        }
        return response.json();
    }
    /** Recursively extracts plain text from an Atlassian Document Format (ADF) node. */
    adfToText(node) {
        if (!node)
            return '';
        if (node.type === 'text')
            return node.text ?? '';
        if (Array.isArray(node.content)) {
            const parts = node.content.map((c) => this.adfToText(c));
            // Add line breaks after block-level nodes
            const sep = ['paragraph', 'heading', 'bulletList', 'orderedList', 'listItem'].includes(node.type ?? '') ? '\n' : '';
            return parts.join('') + sep;
        }
        return '';
    }
    stripHtml(html) {
        return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    // ── Tool: search_jira_issues ─────────────────────────────────────────────
    /**
     * Searches Jira using a JQL query and returns a markdown summary table.
     * @param jql     - A valid JQL query string (e.g. "project = DEV AND status = Open")
     * @param maxResults - Maximum number of results (default 10)
     */
    async searchJiraIssues(jql, maxResults = 10) {
        // Atlassian migrated from GET /rest/api/3/search to POST /rest/api/3/search/jql
        const data = await this.fetchJson(`${this.baseUrl}/rest/api/3/search/jql`, {
            method: 'POST',
            body: JSON.stringify({
                jql,
                maxResults,
                fields: ['summary', 'status', 'assignee', 'priority', 'created', 'updated'],
            }),
        });
        if (data.issues.length === 0) {
            return `No Jira issues found for JQL: \`${jql}\``;
        }
        const lines = [
            `Found **${data.total}** issue(s) (showing ${data.issues.length}):\n`,
            '| Key | Summary | Status | Assignee | Priority |',
            '|-----|---------|--------|----------|----------|',
        ];
        for (const issue of data.issues) {
            const assignee = issue.fields.assignee?.displayName ?? 'Unassigned';
            const priority = issue.fields.priority?.name ?? '—';
            const status = issue.fields.status.name;
            const summary = issue.fields.summary.replace(/\|/g, '\\|');
            lines.push(`| ${issue.key} | ${summary} | ${status} | ${assignee} | ${priority} |`);
        }
        return lines.join('\n');
    }
    // ── Tool: get_issue_details ──────────────────────────────────────────────
    /**
     * Retrieves full details for a single Jira issue, including description and
     * the three most recent comments.
     * @param issueKey - The Jira issue key (e.g. "DEV-404")
     */
    async getIssueDetails(issueKey) {
        const params = new URLSearchParams({
            fields: 'summary,status,assignee,priority,description,comment,labels,created,updated',
        });
        const issue = await this.fetchJson(`${this.baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}?${params}`);
        const f = issue.fields;
        const assignee = f.assignee?.displayName ?? 'Unassigned';
        const priority = f.priority?.name ?? 'None';
        const labels = f.labels?.join(', ') || 'None';
        const description = this.adfToText(f.description).trim() || '_No description provided._';
        let result = `## ${issue.key}: ${f.summary}\n\n` +
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
     * @param projectKey  - The Jira project key (e.g. "DEV")
     * @param summary     - A one-line summary / title for the ticket
     * @param description - The detailed description (plain text)
     */
    async createJiraIssue(projectKey, summary, description) {
        const body = {
            fields: {
                project: { key: projectKey.toUpperCase() },
                summary,
                description: {
                    type: 'doc',
                    version: 1,
                    content: [
                        {
                            type: 'paragraph',
                            content: [{ type: 'text', text: description }],
                        },
                    ],
                },
                issuetype: { name: 'Task' },
            },
        };
        const data = await this.fetchJson(`${this.baseUrl}/rest/api/3/issue`, { method: 'POST', body: JSON.stringify(body) });
        return (`Successfully created **${data.key}**.\n` +
            `View it at: ${this.baseUrl}/browse/${data.key}`);
    }
    // ── Tool: search_confluence ──────────────────────────────────────────────
    /**
     * Searches Confluence using CQL and returns the top matching page snippets.
     * @param query - A keyword or phrase to search for
     * @param limit - Maximum pages to return (default 3)
     */
    async searchConfluence(query, limit = 3) {
        const safeQuery = query.replace(/"/g, '\\"');
        const params = new URLSearchParams({
            cql: `type=page AND text~"${safeQuery}" ORDER BY lastmodified DESC`,
            limit: String(limit),
            expand: 'body.view,space',
        });
        const data = await this.fetchJson(`${this.baseUrl}/wiki/rest/api/content/search?${params}`);
        if (!data.results.length) {
            return `No Confluence pages found for: _${query}_`;
        }
        const lines = [`Found **${data.results.length}** Confluence page(s):\n`];
        for (const page of data.results) {
            const snippet = page.body?.view?.value
                ? this.stripHtml(page.body.view.value).slice(0, 400) + '…'
                : '_No preview available._';
            const link = `${this.baseUrl}/wiki${page._links.webui}`;
            lines.push(`### [${page.title}](${link}) — _${page.space.name}_\n` +
                `${snippet}\n`);
        }
        return lines.join('\n');
    }
}
exports.AtlassianApiService = AtlassianApiService;
//# sourceMappingURL=atlassianApi.js.map