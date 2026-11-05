// Sunroom Shift - Private Authentication & Password Recovery Edge Function
// Server-side username resolution for private vault access.
// Maps usernames ('geet', 'parul', 'nikhil') to private emails without exposing
// credentials or emails to the client bundle, database queries, or responses.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Server-side mapping of usernames to authorized account emails
// STRICTLY SERVER-SIDE: Never sent to or included in frontend bundles
function getUserCredentialMap(): Record<string, string> | null {
  try {
    const raw = Deno.env.get('PRIVATE_USER_MAP')
    if (!raw) return null

    const parsed = JSON.parse(raw)

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) return null

    const allowedUsers = ['geet', 'parul', 'nikhil']

    for (const username of allowedUsers) {
      if (
        typeof parsed[username] !== 'string' ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsed[username])
      ) return null
    }

    const userMap: Record<string, string> = {}

    for (const username of allowedUsers) {
      userMap[username] = parsed[username]
    }

    return userMap
  } catch {
    return null
  }
}

const ALLOWED_ORIGINS = new Set([
  'https://gs4492.github.io',
  'http://localhost:5173',
])

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin')

  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }

  return headers
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: getCorsHeaders(req),
    })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        status: 405,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      }
    )
  }

  const USER_CREDENTIAL_MAP = getUserCredentialMap()

  if (!USER_CREDENTIAL_MAP) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      }
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      }
    )
  }

  // Use standard anon client without persisting session
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  })

  try {
    const contentLength = Number(req.headers.get('Content-Length') || 0)

    if (contentLength > 10_000) {
      return new Response(
        JSON.stringify({ error: 'Request too large.' }),
        {
          status: 413,
          headers: {
            ...getCorsHeaders(req),
            'Content-Type': 'application/json',
          },
        }
      )
    }

    const body = await req.json()

    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body)
    ) {
      return new Response(
        JSON.stringify({ error: 'Invalid request.' }),
        {
          status: 400,
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        }
      )
    }

    const { action, username, password, redirectTo } = body

    if (action !== 'login' && action !== 'recover-password') {
      return new Response(
        JSON.stringify({ error: 'Invalid request.' }),
        {
          status: 400,
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        }
      )
    }

    if (
      typeof username !== 'string' ||
      username.trim().length === 0 ||
      username.trim().length > 32
    ) {
      return new Response(
        JSON.stringify({ error: 'Invalid request.' }),
        {
          status: 400,
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        }
      )
    }

    const cleanUsername = username.trim().toLowerCase()

    if (
      action === 'login' &&
      (typeof password !== 'string' || password.length === 0 || password.length > 256)
    ) {
      return new Response(
        JSON.stringify({ error: 'Invalid username or password.' }),
        {
          status: 401,
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        }
      )
    }

    if (action === 'login') {
      const email = USER_CREDENTIAL_MAP[cleanUsername]

      // Generic authentication failure if user is not in mapping
      if (!email) {
        return new Response(
          JSON.stringify({ error: 'Invalid username or password' }),
          {
            status: 401,
            headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
          }
        )
      }

      // Authenticate with user's actual password against Supabase Auth
      // (Does NOT bypass password verification; does not use service role to impersonate)
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error || !data?.session) {
        // Return generic error without revealing account existence or reasons
        return new Response(
          JSON.stringify({ error: 'Invalid username or password' }),
          {
            status: 401,
            headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
          }
        )
      }

      // Return session tokens to client so client can setSession()
      // NEVER return the resolved email address in the response payload
      return new Response(
        JSON.stringify({
          session: {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_in: data.session.expires_in,
            token_type: data.session.token_type,
          },
          user: {
            id: data.user.id,
          },
          username: cleanUsername,
        }),
        {
          status: 200,
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        }
      )
    }

    // ACTION: recover-password
    if (action === 'recover-password') {
      const email = USER_CREDENTIAL_MAP[cleanUsername]

      if (email) {
        const trustedAppUrl = Deno.env.get('APP_URL')

        if (!trustedAppUrl) {
          return new Response(
            JSON.stringify({ error: 'Server configuration error' }),
            {
              status: 500,
              headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
            }
          )
        }

        try {
          const requestedUrl =
            typeof redirectTo === 'string' ? new URL(redirectTo) : null

          const trustedUrl = new URL(trustedAppUrl)

          const safeRedirect =
            requestedUrl &&
              requestedUrl.origin === trustedUrl.origin
              ? requestedUrl.toString()
              : trustedUrl.toString()

          const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: safeRedirect,
          })

          if (error) {
            console.error('Password recovery request failed.')
          }
        } catch {
          // Keep recovery response generic.
        }
      }

      // Return identical generic success response whether or not username was recognized
      return new Response(
        JSON.stringify({
          message:
            'If this username exists, a password reset link has been sent to the associated email address.',
        }),
        {
          status: 200,
          headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Invalid request.' }),
      {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      }
    )
  } catch {
    return new Response(
      JSON.stringify({ error: 'Unable to process request.' }),
      {
        status: 400,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
      }
    )
  }
})
