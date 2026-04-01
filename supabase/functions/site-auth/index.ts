// Supabase Edge Function: site-auth
// Verifies the site password server-side and signs a short-lived access token.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000
const encoder = new TextEncoder()
const decoder = new TextDecoder()

type SiteAuthRequest = {
  action?: 'unlock' | 'verify'
  password?: string
  token?: string
}

type SiteAccessPayload = {
  scope: 'site-access'
  iat: number
  exp: number
}

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function requireSecret(name: string): string {
  const value = Deno.env.get(name)
  if (!value) {
    throw new Error(`${name} is not configured`)
  }
  return value
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function base64UrlEncode(value: string | Uint8Array): string {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return decoder.decode(bytes)
}

function constantTimeEqual(a: string, b: string): boolean {
  const aBytes = encoder.encode(a)
  const bBytes = encoder.encode(b)
  const maxLength = Math.max(aBytes.length, bBytes.length)
  let diff = aBytes.length === bBytes.length ? 0 : 1

  for (let index = 0; index < maxLength; index += 1) {
    diff |= (aBytes[index] ?? 0) ^ (bBytes[index] ?? 0)
  }

  return diff === 0
}

async function signValue(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value))
  return base64UrlEncode(new Uint8Array(signature))
}

async function issueAccessToken(secret: string): Promise<string> {
  const now = Date.now()
  const payload: SiteAccessPayload = {
    scope: 'site-access',
    iat: now,
    exp: now + TOKEN_TTL_MS,
  }

  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signature = await signValue(encodedPayload, secret)
  return `${encodedPayload}.${signature}`
}

async function verifyAccessToken(token: string, secret: string): Promise<SiteAccessPayload | null> {
  const [encodedPayload, signature] = String(token || '').split('.')
  if (!encodedPayload || !signature) return null

  const expectedSignature = await signValue(encodedPayload, secret)
  if (!constantTimeEqual(signature, expectedSignature)) return null

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SiteAccessPayload
    if (payload.scope !== 'site-access') return null
    if (!Number.isFinite(payload.exp) || payload.exp <= Date.now()) return null
    if (!Number.isFinite(payload.iat) || payload.iat > payload.exp) return null
    return payload
  } catch {
    return null
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const { action, password, token } = await req.json() as SiteAuthRequest
    const sitePassword = requireSecret('SITE_PASSWORD')
    const signingSecret = requireSecret('SITE_AUTH_SIGNING_SECRET')

    if (action === 'unlock') {
      if (!constantTimeEqual(String(password || ''), sitePassword)) {
        return jsonResponse({ authorized: false, error: 'Incorrect password.' }, 401)
      }

      const accessToken = await issueAccessToken(signingSecret)
      return jsonResponse({
        authorized: true,
        token: accessToken,
        expiresInMs: TOKEN_TTL_MS,
      })
    }

    if (action === 'verify') {
      const payload = await verifyAccessToken(String(token || ''), signingSecret)
      if (!payload) {
        return jsonResponse({ authorized: false, error: 'Invalid or expired session.' }, 401)
      }

      return jsonResponse({
        authorized: true,
        expiresAt: payload.exp,
      })
    }

    return jsonResponse({ error: 'Invalid action' }, 400)
  } catch (error: any) {
    console.error('site-auth error:', error)
    return jsonResponse({ error: error?.message || 'Unexpected error' }, 500)
  }
})
