// Linear API client — uses native fetch (Node 22), no SDK dependency.
// All functions throw descriptive errors on API failures.

const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql"
const LINEAR_TOKEN_URL = "https://api.linear.app/oauth/token"

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

// ── Token exchange ──────────────────────────────────────────────────────────

export interface LinearTokenResponse {
  access_token: string
  token_type?: string
  expires_in?: number
  scope?: string
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<LinearTokenResponse> {
  const clientId = process.env.LINEAR_CLIENT_ID
  const clientSecret = process.env.LINEAR_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error("LINEAR_CLIENT_ID and LINEAR_CLIENT_SECRET must be set")
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  })

  const res = await fetch(LINEAR_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Linear token exchange failed: ${res.status} ${text}`)
  }

  return res.json() as Promise<LinearTokenResponse>
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

// ── Create issue ────────────────────────────────────────────────────────────

export interface CreateLinearIssueParams {
  teamId: string
  title: string
  description?: string
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
    `mutation CreateIssue($teamId: String!, $title: String!, $description: String) {
      issueCreate(input: { teamId: $teamId, title: $title, description: $description }) {
        success
        issue {
          id
          identifier
          url
        }
      }
    }`,
    { teamId: params.teamId, title: params.title, description: params.description }
  )

  if (!data.issueCreate.success) {
    throw new Error("Linear issue creation failed")
  }

  return data.issueCreate.issue
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
