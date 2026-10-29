import { supabase } from './supabaseClient.js'
import imageCompression from 'browser-image-compression'

export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const MAX_PHOTOS_PER_HANDOFF = 2
export const MAX_STORAGE_FILE_SIZE_BYTES = 1024 * 1024 // 1 MB Supabase bucket limit
export const TARGET_COMPRESSION_MAX_MB = 0.4 // 400 KB target
export const TARGET_MAX_DIMENSION = 1280
export const SIGNED_URL_EXPIRES_IN = 3600 // 1 hour

export const HEIC_EXTENSIONS = ['.heic', '.heif']
export const HEIC_MIME_TYPES = [
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
  'image/x-heic',
  'image/x-heif',
  'application/heic',
  'application/heif',
]

/**
 * Check if a file is an Apple HEIC/HEIF photo.
 * Accurately handles missing or non-standard MIME types and case variations.
 */
export function isHeicFile(file) {
  if (!file) return false
  const type = (file.type || '').toLowerCase().trim()
  const name = (file.name || '').toLowerCase().trim()

  // 1. Check file extension (.heic, .heif)
  for (const ext of HEIC_EXTENSIONS) {
    if (name.endsWith(ext)) return true
  }

  // 2. Check standard and non-standard MIME types
  if (HEIC_MIME_TYPES.includes(type)) {
    return true
  }

  return false
}

/**
 * Validate incoming files for format and slot capacity.
 * Accepts JPEG, PNG, WebP, and HEIC/HEIF files.
 */
export function validatePhotoFiles(newFiles, currentCount = 0) {
  if (!newFiles || newFiles.length === 0) {
    return { valid: true, error: null }
  }

  // Ensure each file is either an accepted image format or HEIC/HEIF
  for (const file of newFiles) {
    const isHeic = isHeicFile(file)
    const isStandardAllowed = ALLOWED_MIME_TYPES.includes(file.type)

    if (!isHeic && !isStandardAllowed) {
      return {
        valid: false,
        error: 'Please select JPEG, PNG, WebP, or HEIC/HEIF images.',
      }
    }
  }

  // Check photo count limit
  if (currentCount + newFiles.length > MAX_PHOTOS_PER_HANDOFF) {
    return {
      valid: false,
      error: `You can attach a maximum of ${MAX_PHOTOS_PER_HANDOFF} photos per handoff.`,
    }
  }

  return { valid: true, error: null }
}

/**
 * Convert a HEIC/HEIF file or Blob to JPEG in the browser.
 * Uses dynamic import of heic2any so the conversion engine is only loaded
 * on-demand when a HEIC photo is selected.
 * Supports a customConverter parameter for automated test mocking.
 */
export async function convertHeicToJpeg(file, customConverter = null) {
  if (!isHeicFile(file)) {
    return file
  }

  // If a mock or custom converter is injected (e.g. in test runner), use it
  if (customConverter) {
    try {
      const converted = await customConverter(file)
      if (!converted || !(converted instanceof Blob || converted instanceof File)) {
        throw new Error('HEIC conversion failed: converter returned an invalid image.')
      }
      const safeBase = sanitizeFileName(file.name)
      return new File([converted], `${safeBase}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      })
    } catch (err) {
      console.error('HEIC to JPEG conversion error:', err)
      throw new Error(
        `Could not convert HEIC photo (${file.name || 'image'}): ${err.message || 'unsupported or corrupted format'}`,
        { cause: err }
      )
    }
  }

  if (typeof window === 'undefined') {
    throw new Error('HEIC conversion is only supported in browser environments.')
  }

  try {
    const heic2anyModule = await import('heic2any')
    const heic2any = heic2anyModule.default || heic2anyModule

    const result = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.9,
    })

    const finalBlob = Array.isArray(result) ? result[0] : result

    if (!finalBlob || finalBlob.size === 0) {
      throw new Error('HEIC conversion yielded an empty image.')
    }

    const safeBase = sanitizeFileName(file.name)
    return new File([finalBlob], `${safeBase}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })
  } catch (err) {
    console.error('HEIC to JPEG conversion error:', err)
    throw new Error(
      `Could not convert HEIC photo (${file.name || 'image'}). The file may be corrupt or unsupported by this browser.`,
      { cause: err }
    )
  }
}

/**
 * Process a photo end-to-end:
 * 1. Automatically converts HEIC/HEIF files to JPEG.
 * 2. Compresses and resizes to target <= 0.4 MB and max dimension 1280px.
 * 3. Enforces the Supabase bucket 1 MB limit with a fallback pass if needed.
 * 4. Produces a standard JPEG File with safe .jpg name and image/jpeg content type.
 */
export async function processAndCompressPhoto(file, customConverter = null) {
  if (!file) {
    throw new Error('No photo file provided.')
  }

  let fileToCompress = file

  // Step 1: If HEIC/HEIF, convert to JPEG before compression
  if (isHeicFile(file)) {
    fileToCompress = await convertHeicToJpeg(file, customConverter)
  }

  // Ensure resulting file is an accepted image format before compression
  if (!ALLOWED_MIME_TYPES.includes(fileToCompress.type)) {
    throw new Error(
      `Unsupported image format (${fileToCompress.type || 'unknown'}). Please choose JPEG, PNG, or WebP.`
    )
  }

  // Step 2: Compress and resize
  const compressedFile = await compressPhoto(fileToCompress)

  // Step 3: Strict 1 MB storage limit verification
  if (compressedFile.size > MAX_STORAGE_FILE_SIZE_BYTES) {
    throw new Error(
      `Photo exceeds the 1 MB storage limit after compression (${(compressedFile.size / 1024 / 1024).toFixed(2)} MB).`
    )
  }

  return compressedFile
}

/**
 * Compress and resize an image file using browser-image-compression.
 */
export async function compressPhoto(file) {
  const options = {
    maxSizeMB: TARGET_COMPRESSION_MAX_MB,
    maxWidthOrHeight: TARGET_MAX_DIMENSION,
    useWebWorker: true,
    fileType: 'image/jpeg',
  }

  const compressedBlob = await imageCompression(file, options)

  // Ensure file size does not exceed 1 MB bucket limit
  if (compressedBlob.size > MAX_STORAGE_FILE_SIZE_BYTES) {
    // Retry with slightly more aggressive compression if needed
    const secondPassBlob = await imageCompression(file, {
      ...options,
      maxSizeMB: 0.3,
      maxWidthOrHeight: 1024,
    })
    return new File(
      [secondPassBlob],
      `${sanitizeFileName(file.name)}.jpg`,
      {
        type: 'image/jpeg',
        lastModified: Date.now(),
      }
    )
  }

  return new File(
    [compressedBlob],
    `${sanitizeFileName(file.name)}.jpg`,
    {
      type: 'image/jpeg',
      lastModified: Date.now(),
    }
  )
}

/**
 * Sanitize a file name to alphanumeric, dash, and underscore.
 */
export function sanitizeFileName(name) {
  if (!name) return 'photo'
  const nameWithoutExt = name.replace(/\.[^/.]+$/, '')
  const safeName = nameWithoutExt.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)
  return safeName || 'photo'
}

/**
 * Generate a unique storage path partitioned by handoff ID.
 */
export function createStoragePath(handoffId, fileName, index = 0) {
  const timestamp = Date.now()
  const safe = sanitizeFileName(fileName)
  return `handoffs/${handoffId}/${timestamp}_${index}_${safe}.jpg`
}

/**
 * Helper to invoke the dedicated handoff-photos Edge Function if deployed.
 * Returns null if the function is not deployed or returns an error.
 */
async function callEdgeFunction(action, payload) {
  try {
    const { data, error } = await supabase.functions.invoke('handoff-photos', {
      body: { action, ...payload },
    })
    if (error || !data) {
      return null
    }
    return data
  } catch {
    return null
  }
}

/**
 * Load photos and short-lived signed URLs for a list of handoff IDs.
 * Returns an object mapping handoffId -> array of photo objects with signedUrl.
 */
export async function loadPhotosForHandoffs(handoffIds) {
  if (!handoffIds || handoffIds.length === 0) return {}

  // 1. Try Edge Function first if deployed
  const edgeResult = await callEdgeFunction('get-photos-for-handoffs', {
    handoff_ids: handoffIds,
  })
  if (edgeResult && edgeResult.photosByHandoff) {
    return edgeResult.photosByHandoff
  }

  // 2. Direct Supabase client fallback
  try {
    const { data: photoRows, error: fetchError } = await supabase
      .from('handoff_photos')
      .select('*')
      .in('handoff_id', handoffIds)
      .order('created_at', { ascending: true })

    if (fetchError) {
      console.warn('Could not load handoff photos metadata:', fetchError.message)
      return {}
    }

    if (!photoRows || photoRows.length === 0) {
      return {}
    }

    // Generate signed URLs in bulk
    const paths = photoRows.map((p) => p.storage_path)
    const { data: signedUrls, error: signError } = await supabase.storage
      .from('handoff-photos')
      .createSignedUrls(paths, SIGNED_URL_EXPIRES_IN)

    const urlMap = {}
    if (!signError && signedUrls) {
      for (const item of signedUrls) {
        if (item.signedUrl) {
          urlMap[item.path] = item.signedUrl
        }
      }
    }

    const photosByHandoff = {}
    for (const row of photoRows) {
      if (!photosByHandoff[row.handoff_id]) {
        photosByHandoff[row.handoff_id] = []
      }
      photosByHandoff[row.handoff_id].push({
        id: row.id,
        handoff_id: row.handoff_id,
        storage_path: row.storage_path,
        content_type: row.content_type,
        created_at: row.created_at,
        signedUrl: urlMap[row.storage_path] || null,
      })
    }

    return photosByHandoff
  } catch (err) {
    console.warn('Error loading handoff photos:', err)
    return {}
  }
}

/**
 * Upload an array of compressed image files for a handoff.
 * If any upload fails, automatically cleans up previously uploaded files
 * in this batch to avoid orphaned storage objects and database rows.
 */
export async function uploadHandoffPhotosWithRollback(handoffId, files) {
  if (!files || files.length === 0) return []

  const uploadedRecords = []
  const uploadedStoragePaths = []

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const storagePath = createStoragePath(handoffId, file.name, i)

      // Upload file to private Supabase Storage bucket
      const { error: uploadError } = await supabase.storage
        .from('handoff-photos')
        .upload(storagePath, file, {
          contentType: file.type || 'image/jpeg',
          upsert: false,
        })

      if (uploadError) {
        throw new Error(
          `Failed to upload photo (${file.name}): ${uploadError.message}`
        )
      }

      uploadedStoragePaths.push(storagePath)

      // Insert record into public.handoff_photos
      const { data: record, error: dbError } = await supabase
        .from('handoff_photos')
        .insert({
          handoff_id: handoffId,
          storage_path: storagePath,
          content_type: file.type || 'image/jpeg',
        })
        .select()
        .single()

      if (dbError) {
        throw new Error(
          `Failed to save photo record: ${dbError.message}`
        )
      }

      // Generate signed URL for immediate display
      const { data: signedData } = await supabase.storage
        .from('handoff-photos')
        .createSignedUrl(storagePath, SIGNED_URL_EXPIRES_IN)

      uploadedRecords.push({
        ...record,
        signedUrl: signedData?.signedUrl || null,
      })
    }

    return uploadedRecords
  } catch (error) {
    console.error('Photo upload failed, rolling back uploaded files:', error)
    const cleanupFailures = []

    // Rollback: Clean up any files uploaded in this batch
    if (uploadedStoragePaths.length > 0) {
      try {
        const { error: removeErr } = await supabase.storage
          .from('handoff-photos')
          .remove(uploadedStoragePaths)
        if (removeErr) {
          cleanupFailures.push(`Storage cleanup failed: ${removeErr.message}`)
        }
      } catch (cleanupErr) {
        cleanupFailures.push(`Storage cleanup exception: ${cleanupErr.message}`)
      }
    }

    if (uploadedRecords.length > 0) {
      try {
        const idsToDelete = uploadedRecords.map((r) => r.id)
        const { error: dbDeleteErr } = await supabase
          .from('handoff_photos')
          .delete()
          .in('id', idsToDelete)
        if (dbDeleteErr) {
          cleanupFailures.push(`Database metadata cleanup failed: ${dbDeleteErr.message}`)
        }
      } catch (cleanupErr) {
        cleanupFailures.push(`Database metadata cleanup exception: ${cleanupErr.message}`)
      }
    }

    if (cleanupFailures.length > 0) {
      const detailedMessage = `${error.message} (Warning: Rollback incomplete - ${cleanupFailures.join('; ')})`
      const compositeError = new Error(detailedMessage)
      compositeError.originalError = error
      compositeError.cleanupFailures = cleanupFailures
      throw compositeError
    }

    throw error
  }
}

/**
 * Delete specific photos from both Supabase Storage and public.handoff_photos.
 * Resolves missing storage_path values from photo IDs before deleting Storage objects.
 * Handles missing records and errors safely.
 */
export async function deleteHandoffPhotos(photos) {
  if (!photos || photos.length === 0) return true

  const knownPaths = new Set()
  const idsNeedingPathLookup = []
  const allIds = new Set()

  for (const item of photos) {
    if (!item) continue
    if (typeof item === 'string') {
      knownPaths.add(item)
    } else if (typeof item === 'number') {
      allIds.add(item)
      idsNeedingPathLookup.push(item)
    } else if (typeof item === 'object') {
      if (item.id) allIds.add(item.id)
      if (item.storage_path) {
        knownPaths.add(item.storage_path)
      } else if (item.id) {
        idsNeedingPathLookup.push(item.id)
      }
    }
  }

  // If storage paths are missing for any photo IDs, query database to resolve them
  if (idsNeedingPathLookup.length > 0) {
    try {
      const { data, error } = await supabase
        .from('handoff_photos')
        .select('id, storage_path')
        .in('id', idsNeedingPathLookup)

      if (error) {
        console.warn('Could not query storage paths for photo IDs:', error.message)
      } else if (data && data.length > 0) {
        for (const row of data) {
          if (row.storage_path) {
            knownPaths.add(row.storage_path)
          }
        }
      }
    } catch (lookupErr) {
      console.warn('Error resolving missing storage paths before deletion:', lookupErr)
    }
  }

  const finalPaths = Array.from(knownPaths).filter(Boolean)
  const finalIds = Array.from(allIds).filter(Boolean)

  let storageSuccess = true
  let dbSuccess = true

  // 1. Delete objects from Storage bucket
  if (finalPaths.length > 0) {
    try {
      const { error: storageError } = await supabase.storage
        .from('handoff-photos')
        .remove(finalPaths)

      if (storageError) {
        console.warn('Storage file deletion warning:', storageError.message)
        storageSuccess = false
      }
    } catch (storageErr) {
      console.warn('Storage removal exception:', storageErr)
      storageSuccess = false
    }
  }

  // 2. Delete rows from handoff_photos
  if (finalIds.length > 0) {
    try {
      const { error: dbError } = await supabase
        .from('handoff_photos')
        .delete()
        .in('id', finalIds)

      if (dbError) {
        console.warn('DB photo row deletion warning:', dbError.message)
        dbSuccess = false
      }
    } catch (dbErr) {
      console.warn('DB photo row deletion exception:', dbErr)
      dbSuccess = false
    }
  }

  return storageSuccess && dbSuccess
}

/**
 * Delete all photos associated with a handoff.
 * Fetches associated photos first if not already supplied, removes them from
 * storage, and removes the database rows.
 */
export async function cleanupAllPhotosForHandoff(handoffId, knownPhotos = null) {
  try {
    let photosToDelete = knownPhotos

    if (!photosToDelete || photosToDelete.length === 0) {
      const { data } = await supabase
        .from('handoff_photos')
        .select('id, storage_path')
        .eq('handoff_id', handoffId)
      photosToDelete = data || []
    }

    if (photosToDelete.length > 0) {
      await deleteHandoffPhotos(photosToDelete)
    }
    return true
  } catch (err) {
    console.error(`Failed to cleanup photos for handoff ${handoffId}:`, err)
    return false
  }
}
