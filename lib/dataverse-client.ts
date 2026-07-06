// Server-side Dataverse REST API client — OAuth2 client credentials flow.
//
// Required env vars (add to .env.local and Vercel project settings):
//   DATAVERSE_ORG_URL        https://orgfefc6e17.crm4.dynamics.com   (has default)
//   DATAVERSE_TENANT_ID      71d67428-fab1-4e21-b3f4-1c8172e86fcd   (has default)
//   DATAVERSE_CLIENT_ID      <app registration client ID>            (must be set)
//   DATAVERSE_CLIENT_SECRET  <client secret value>                   (must be set)
//
// Setup checklist:
//   1. Azure Portal → Entra ID → App registrations → New registration
//      Name: "Salon Rewards Dashboard"  |  Accounts in this org only
//   2. Certificates & Secrets → New client secret → copy VALUE
//   3. Power Platform Admin Center → Environments → your env →
//      Settings → Users + permissions → Application users → + New app user
//      Select the registered app, assign Security Role: "System Administrator" (or custom)
//   4. Add DATAVERSE_CLIENT_ID and DATAVERSE_CLIENT_SECRET to Vercel env vars

const ORG_URL =
  process.env.DATAVERSE_ORG_URL ?? "https://orgfefc6e17.crm4.dynamics.com"
const TENANT_ID =
  process.env.DATAVERSE_TENANT_ID ?? "71d67428-fab1-4e21-b3f4-1c8172e86fcd"
const CLIENT_ID = process.env.DATAVERSE_CLIENT_ID
const CLIENT_SECRET = process.env.DATAVERSE_CLIENT_SECRET

interface TokenCache {
  token: string
  expires: number
}

let _token: TokenCache | null = null

export async function getAccessToken(): Promise<string> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(
      "DATAVERSE_CLIENT_ID and DATAVERSE_CLIENT_SECRET env vars are not set. " +
        "Follow the setup checklist in lib/dataverse-client.ts."
    )
  }

  if (_token && Date.now() < _token.expires - 60_000) return _token.token

  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scope: `${ORG_URL}/.default`,
      }).toString(),
    }
  )

  if (!res.ok) {
    throw new Error(`Dataverse token request failed: ${await res.text()}`)
  }

  const data = (await res.json()) as { access_token: string; expires_in: number }
  _token = { token: data.access_token, expires: Date.now() + data.expires_in * 1000 }
  return _token.token
}

export async function dvFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken()
  const url = path.startsWith("http") ? path : `${ORG_URL}/api/data/v9.2${path}`

  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "OData-MaxVersion": "4.0",
      "OData-Version": "4.0",
      Accept: "application/json",
      "Content-Type": "application/json",
      ...init.headers,
    },
  })
}
