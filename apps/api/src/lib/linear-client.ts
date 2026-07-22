// Linear API client — uses native fetch (Node 22), no SDK dependency.
// All functions throw descriptive errors on API failures.

const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql"

// ── GraphQL helper ──────────────────────────────────────────────────────────

async function linearGraphQL<T = unknown>(
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(LINEAR_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Linear API error: ${res.status} ${text}`)
  }

  const json = await res.json() as { data?: T; errors?: Array<{ message: string }> }

  if (json.errors && json.errors.length > 0) {
    throw new Error(`Linear GraphQL error: ${json.errors[0]!.message}`)
  }

  if (!json.data) {
    throw new Error("Linear API returned no data")
  }

  return json.data
}

// ── Organization ────────────────────────────────────────────────────────────

export async function getLinearOrganization(
  accessToken: string
): Promise<{ id: string; name: string }> {
  const data = await linearGraphQL<{ organization: { id: string; name: string } }>(
    accessToken,
    `{ organization { id name } }`
  )
  return data.organization
}

// ── Teams ───────────────────────────────────────────────────────────────────

export async function getLinearTeams(
  accessToken: string
): Promise<Array<{ id: string; name: string }>> {
  const data = await linearGraphQL<{ teams: { nodes: Array<{ id: string; name: string }> } }>(
    accessToken,
    `{ teams { nodes { id name } } }`
  )
  return data.teams.nodes
}

// ── Label lookup ────────────────────────────────────────────────────────────

let _cachedBugLabelId: string | null | undefined

/** Look up the "Bug" label ID (cached for the process lifetime) */
export async function getLinearBugLabelId(accessToken: string): Promise<string | null> {
  if (_cachedBugLabelId !== undefined) return _cachedBugLabelId

  const data = await linearGraphQL<{
    issueLabels: { nodes: Array<{ id: string; name: string }> }
  }>(
    accessToken,
    `{ issueLabels(filter: { name: { eq: "Bug" } }, first: 1) { nodes { id name } } }`
  )

  _cachedBugLabelId = data.issueLabels.nodes[0]?.id ?? null
  return _cachedBugLabelId
}

// ── Create issue ────────────────────────────────────────────────────────────

export interface CreateLinearIssueParams {
  teamId: string
  title: string
  description?: string | undefined
  labelIds?: string[]
}

export interface LinearIssue {
  id: string
  identifier: string
  url: string
}

export async function createLinearIssue(
  accessToken: string,
  params: CreateLinearIssueParams
): Promise<LinearIssue> {
  const data = await linearGraphQL<{
    issueCreate: { success: boolean; issue: LinearIssue }
  }>(
    accessToken,
    `mutation CreateIssue($teamId: String!, $title: String!, $description: String, $labelIds: [String!]) {
      issueCreate(input: { teamId: $teamId, title: $title, description: $description, labelIds: $labelIds }) {
        success
        issue {
          id
          identifier
          url
        }
      }
    }`,
    { teamId: params.teamId, title: params.title, description: params.description, labelIds: params.labelIds }
  )

  if (!data.issueCreate.success) {
    throw new Error("Linear issue creation failed")
  }

  return data.issueCreate.issue
}

// ── Create attachment link on issue ──────────────────────────────────────────

export async function createLinearAttachmentLink(
  accessToken: string,
  issueId: string,
  title: string,
  url: string
): Promise<boolean> {
  const data = await linearGraphQL<{
    attachmentLinkURL: { success: boolean }
  }>(
    accessToken,
    `mutation AttachLink($issueId: String!, $title: String!, $url: String!) {
      attachmentLinkURL(issueId: $issueId, title: $title, url: $url) {
        success
      }
    }`,
    { issueId, title, url }
  )
  return data.attachmentLinkURL.success
}

// ── Get issue detail ─────────────────────────────────────────────────────────

export interface LinearIssueDetail {
  id: string
  identifier: string
  title: string
  description: string | null
  url: string
}

export async function getLinearIssueDetail(
  accessToken: string,
  issueIdentifier: string
): Promise<LinearIssueDetail> {
  const data = await linearGraphQL<{ issue: LinearIssueDetail }>(
    accessToken,
    `query IssueDetail($id: String!) {
      issue(id: $id) {
        id
        identifier
        title
        description
        url
      }
    }`,
    { id: issueIdentifier }
  )
  return data.issue
}

// ── Get issue status ────────────────────────────────────────────────────────

export async function getLinearIssueStatus(
  accessToken: string,
  issueId: string
): Promise<{ id: string; status: string }> {
  const data = await linearGraphQL<{ issue: { id: string; state: { name: string } } }>(
    accessToken,
    `query IssueStatus($id: String!) {
      issue(id: $id) {
        id
        state { name }
      }
    }`,
    { id: issueId }
  )
  return { id: data.issue.id, status: data.issue.state.name }
}
