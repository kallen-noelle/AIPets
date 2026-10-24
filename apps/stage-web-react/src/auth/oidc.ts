/**
 * OIDC Authorization Code + PKCE client.
 *
 * The storage keys match the Vue auth store, so a signed-in session carries
 * over between both frontends.
 */

export const serverUrl = import.meta.env.VITE_SERVER_URL || 'https://api.airi.build'
export const oidcClientId = import.meta.env.VITE_OIDC_CLIENT_ID || 'airi-stage-web'

export type SocialProvider = 'google' | 'github' | 'steam'

export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  id_token?: string
  scope?: string
}

export interface AuthUser {
  id: string
  name: string
  email: string | null
  image: string | null
}

interface FlowState {
  codeVerifier: string
  state: string
}

interface FlowParams {
  clientId: string
  redirectUri: string
  provider?: SocialProvider
}

const tokenKey = 'auth/v1/token'
const refreshTokenKey = 'auth/v1/refresh-token'
const idTokenKey = 'auth/v1/oidc-id-token'
const clientIdKey = 'auth/v1/oidc-client-id'
const expiryKey = 'auth/v1/oidc-token-expiry'
const flowStateKey = 'auth/v1/oidc-flow-state'
const flowParamsKey = 'auth/v1/oidc-flow-params'

const authorizePath = '/api/auth/oauth2/authorize'
const tokenPath = '/api/auth/oauth2/token'
const sessionPath = '/api/auth/get-session'

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes)
    binary += String.fromCharCode(byte)

  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function randomString(length = 48): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(length)))
}

async function sha256(input: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return new Uint8Array(digest)
}

export function getRedirectUri(): string {
  return `${window.location.origin}/auth/callback`
}

export function getAccessToken(): string | null {
  return localStorage.getItem(tokenKey)
}

export function getTokenExpiry(): number {
  return Number.parseInt(localStorage.getItem(expiryKey) ?? '', 10) || 0
}

export function saveTokens(tokens: TokenResponse, clientId: string) {
  localStorage.setItem(tokenKey, tokens.access_token)
  localStorage.setItem(clientIdKey, clientId)
  localStorage.setItem(expiryKey, String(Date.now() + tokens.expires_in * 1000))

  if (tokens.refresh_token)
    localStorage.setItem(refreshTokenKey, tokens.refresh_token)
  if (tokens.id_token)
    localStorage.setItem(idTokenKey, tokens.id_token)
}

export function clearTokens() {
  for (const key of [tokenKey, refreshTokenKey, idTokenKey, clientIdKey, expiryKey])
    localStorage.removeItem(key)
}

/** Builds the authorization URL and persists the PKCE state for the callback. */
export async function buildSignInUrl(provider?: SocialProvider): Promise<string> {
  const codeVerifier = randomString()
  const codeChallenge = toBase64Url(await sha256(codeVerifier))
  const state = randomString(24)

  const flowState: FlowState = { codeVerifier, state }
  const flowParams: FlowParams = { clientId: oidcClientId, redirectUri: getRedirectUri(), provider }

  sessionStorage.setItem(flowStateKey, JSON.stringify(flowState))
  sessionStorage.setItem(flowParamsKey, JSON.stringify(flowParams))

  const url = new URL(authorizePath, serverUrl)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', flowParams.clientId)
  url.searchParams.set('redirect_uri', flowParams.redirectUri)
  url.searchParams.set('scope', 'openid profile email offline_access')
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('resource', serverUrl)

  if (provider)
    url.searchParams.set('provider', provider)

  return url.toString()
}

function consumeFlowState(): { flowState: FlowState, params: FlowParams } | null {
  const flowStateRaw = sessionStorage.getItem(flowStateKey)
  const paramsRaw = sessionStorage.getItem(flowParamsKey)

  if (!flowStateRaw || !paramsRaw)
    return null

  sessionStorage.removeItem(flowStateKey)
  sessionStorage.removeItem(flowParamsKey)

  return {
    flowState: JSON.parse(flowStateRaw) as FlowState,
    params: JSON.parse(paramsRaw) as FlowParams,
  }
}

async function requestTokens(body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(new URL(tokenPath, serverUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!response.ok)
    throw new Error(`Token request failed: ${response.status} ${await response.text()}`)

  return await response.json() as TokenResponse
}

/** Exchanges the authorization code and stores the returned tokens. */
export async function completeSignIn(code: string, returnedState: string): Promise<void> {
  const persisted = consumeFlowState()
  if (!persisted)
    throw new Error('Missing OIDC flow state')

  if (returnedState !== persisted.flowState.state)
    throw new Error('OIDC state mismatch')

  const tokens = await requestTokens(new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: persisted.params.redirectUri,
    client_id: persisted.params.clientId,
    code_verifier: persisted.flowState.codeVerifier,
    resource: serverUrl,
  }))

  saveTokens(tokens, persisted.params.clientId)
}

/** Refreshes the access token when it is missing, expired, or close to expiry. */
export async function ensureFreshToken(): Promise<string | null> {
  const token = getAccessToken()
  if (!token)
    return null

  if (getTokenExpiry() - Date.now() > 60_000)
    return token

  const refreshToken = localStorage.getItem(refreshTokenKey)
  const clientId = localStorage.getItem(clientIdKey)
  if (!refreshToken || !clientId)
    return token

  try {
    const tokens = await requestTokens(new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      resource: serverUrl,
    }))

    saveTokens(tokens, clientId)
    return tokens.access_token
  }
  catch {
    return token
  }
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const token = await ensureFreshToken()
  if (!token)
    return null

  const response = await fetch(new URL(sessionPath, serverUrl), {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok)
    return null

  const data = await response.json() as { user?: AuthUser } | null
  return data?.user ?? null
}
