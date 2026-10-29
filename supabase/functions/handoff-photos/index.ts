// Sunroom Shift - Dedicated Photo Attachments Edge Function
// Server-side photo operations using Supabase Service Role credentials
// Ensures storage bucket handoff-photos remains strictly private.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BUCKET_NAME = 'handoff-photos'
const SIGNED_URL_EXPIRES_IN = 3600 // 1 hour

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error: missing service credentials' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  })

  try {
    const body = await req.json()
    const { action } = body

    if (!action) {
      return new Response(
        JSON.stringify({ error: 'Missing action parameter' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // ACTION: get-photos-for-handoffs
    // Batch load photos and signed URLs for handoff cards
    if (action === 'get-photos-for-handoffs') {
      const { handoff_ids } = body

      if (!Array.isArray(handoff_ids) || handoff_ids.length === 0) {
        return new Response(
          JSON.stringify({ photosByHandoff: {} }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      // Sanitize handoff IDs to numbers
      const sanitizedIds = handoff_ids
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0)

      if (sanitizedIds.length === 0) {
        return new Response(
          JSON.stringify({ photosByHandoff: {} }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      const { data: photoRows, error: fetchError } = await supabase
        .from('handoff_photos')
        .select('*')
        .in('handoff_id', sanitizedIds)
        .order('created_at', { ascending: true })

      if (fetchError) {
        throw new Error(fetchError.message)
      }

      if (!photoRows || photoRows.length === 0) {
        return new Response(
          JSON.stringify({ photosByHandoff: {} }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      const paths = photoRows.map((p) => p.storage_path)
      const { data: signedUrls, error: signError } = await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrls(paths, SIGNED_URL_EXPIRES_IN)

      if (signError) {
        throw new Error(signError.message)
      }

      const urlMap: Record<string, string> = {}
      if (signedUrls) {
        for (const item of signedUrls) {
          if (item.signedUrl) {
            urlMap[item.path] = item.signedUrl
          }
        }
      }

      const photosByHandoff: Record<string, any[]> = {}
      for (const row of photoRows) {
        const hId = String(row.handoff_id)
        if (!photosByHandoff[hId]) {
          photosByHandoff[hId] = []
        }
        photosByHandoff[hId].push({
          id: row.id,
          handoff_id: row.handoff_id,
          storage_path: row.storage_path,
          content_type: row.content_type,
          created_at: row.created_at,
          signedUrl: urlMap[row.storage_path] || null,
        })
      }

      return new Response(
        JSON.stringify({ photosByHandoff }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // ACTION: get-signed-urls
    if (action === 'get-signed-urls') {
      const { paths } = body

      if (!Array.isArray(paths) || paths.length === 0) {
        return new Response(
          JSON.stringify({ error: 'paths must be a non-empty array' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      // Security check: ensure all paths strictly follow handoffs/<id>/<filename>
      const pathRegex = /^handoffs\/\d+\/[a-zA-Z0-9_.-]+$/
      for (const p of paths) {
        if (typeof p !== 'string' || !pathRegex.test(p) || p.includes('..')) {
          return new Response(
            JSON.stringify({ error: `Invalid storage path: ${p}` }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          )
        }
      }

      const { data: signedUrls, error: signError } = await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrls(paths, SIGNED_URL_EXPIRES_IN)

      if (signError) {
        throw new Error(signError.message)
      }

      return new Response(
        JSON.stringify({ signedUrls }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // ACTION: delete-photos
    if (action === 'delete-photos') {
      const { photo_ids, storage_paths } = body

      let pathsToDelete: string[] = []

      if (Array.isArray(storage_paths) && storage_paths.length > 0) {
        pathsToDelete = storage_paths
      } else if (Array.isArray(photo_ids) && photo_ids.length > 0) {
        const { data: rows } = await supabase
          .from('handoff_photos')
          .select('storage_path')
          .in('id', photo_ids)
        if (rows) {
          pathsToDelete = rows.map((r) => r.storage_path)
        }
      }

      // Validate paths before deleting
      const pathRegex = /^handoffs\/\d+\/[a-zA-Z0-9_.-]+$/
      pathsToDelete = pathsToDelete.filter(
        (p) => typeof p === 'string' && pathRegex.test(p) && !p.includes('..')
      )

      if (pathsToDelete.length > 0) {
        await supabase.storage.from(BUCKET_NAME).remove(pathsToDelete)
      }

      if (Array.isArray(photo_ids) && photo_ids.length > 0) {
        await supabase
          .from('handoff_photos')
          .delete()
          .in('id', photo_ids)
      } else if (pathsToDelete.length > 0) {
        await supabase
          .from('handoff_photos')
          .delete()
          .in('storage_path', pathsToDelete)
      }

      return new Response(
        JSON.stringify({ success: true, deletedCount: pathsToDelete.length }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // ACTION: delete-handoff-photos
    // Delete all photos for a single handoff
    if (action === 'delete-handoff-photos') {
      const { handoff_id } = body
      const hId = Number(handoff_id)

      if (!Number.isInteger(hId) || hId <= 0) {
        return new Response(
          JSON.stringify({ error: 'Valid handoff_id is required' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }

      const { data: rows } = await supabase
        .from('handoff_photos')
        .select('storage_path')
        .eq('handoff_id', hId)

      if (rows && rows.length > 0) {
        const paths = rows.map((r) => r.storage_path)
        await supabase.storage.from(BUCKET_NAME).remove(paths)
        await supabase
          .from('handoff_photos')
          .delete()
          .eq('handoff_id', hId)
      }

      return new Response(
        JSON.stringify({ success: true }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'An unexpected error occurred' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
