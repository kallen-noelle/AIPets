import { describe, expect, it } from 'vitest'

import { buildAuthUiRedirectUrl, buildAuthUiUrl, resolveAuthUiUrl } from '../routes'

describe('auth UI URL helpers', () => {
  it('builds auth UI URLs under the configured auth base path', () => {
    expect(buildAuthUiUrl('https://accounts.aipets.build/ui', '/sign-in', '?client_id=web')).toBe(
      'https://accounts.aipets.build/ui/sign-in?client_id=web',
    )
  })

  it('maps server /auth requests to the standalone auth UI while preserving queries', () => {
    expect(buildAuthUiRedirectUrl(
      'https://accounts.aipets.build/ui/',
      'https://api.aipets.build/auth/verify-email?verified=true',
    )).toBe('https://accounts.aipets.build/ui/verify-email?verified=true')
  })

  it('adds the API server origin for standalone auth UI cross-environment redirects', () => {
    expect(buildAuthUiRedirectUrl(
      'https://auth-preview.example/ui/',
      'https://api-dev.aipets.build/auth/sign-in?client_id=aipets-stage-web&api_server_url=https%3A%2F%2Fevil.example',
      'https://api-dev.aipets.build/api/auth',
    )).toBe(
      'https://auth-preview.example/ui/sign-in?client_id=aipets-stage-web&api_server_url=https%3A%2F%2Fapi-dev.aipets.build',
    )
  })

  it('routes server-dev default auth UI redirects to the matching Pages branch', () => {
    expect(buildAuthUiRedirectUrl(
      'https://accounts.aipets.build/ui',
      'https://api-dev.aipets.build/auth/sign-in?client_id=aipets-stage-web',
      'https://api-dev.aipets.build',
    )).toBe(
      'https://server-dev.aipets-server-auth.pages.dev/ui/sign-in?client_id=aipets-stage-web&api_server_url=https%3A%2F%2Fapi-dev.aipets.build',
    )
  })

  it('keeps an explicitly configured auth UI URL for server-dev', () => {
    expect(resolveAuthUiUrl(
      'https://auth-preview.example/ui',
      'https://api-dev.aipets.build',
    )).toBe('https://auth-preview.example/ui')
  })
})
