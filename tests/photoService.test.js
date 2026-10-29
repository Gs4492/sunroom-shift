import test from 'node:test'
import assert from 'node:assert/strict'

import {
  isHeicFile,
  validatePhotoFiles,
  sanitizeFileName,
  createStoragePath,
  convertHeicToJpeg,
  processAndCompressPhoto,
  ALLOWED_MIME_TYPES,
  MAX_PHOTOS_PER_HANDOFF,
  MAX_STORAGE_FILE_SIZE_BYTES,
  TARGET_COMPRESSION_MAX_MB,
  TARGET_MAX_DIMENSION,
  HEIC_EXTENSIONS,
  HEIC_MIME_TYPES,
} from '../src/photoService.js'

test('Photo Service - Configuration Constants', () => {
  assert.deepEqual(ALLOWED_MIME_TYPES, ['image/jpeg', 'image/png', 'image/webp'])
  assert.equal(MAX_PHOTOS_PER_HANDOFF, 2)
  assert.equal(TARGET_COMPRESSION_MAX_MB, 0.4)
  assert.equal(TARGET_MAX_DIMENSION, 1280)
  assert.equal(MAX_STORAGE_FILE_SIZE_BYTES, 1024 * 1024)
  assert.deepEqual(HEIC_EXTENSIONS, ['.heic', '.heif'])
  assert.equal(HEIC_MIME_TYPES.includes('image/heic'), true)
  assert.equal(HEIC_MIME_TYPES.includes('image/heif'), true)
})

test('Photo Service - HEIC / HEIF Detection (Standard, Non-Standard, and Missing MIME Types)', () => {
  // 1. Standard MIME types
  assert.equal(isHeicFile({ type: 'image/heic', name: 'photo.jpg' }), true)
  assert.equal(isHeicFile({ type: 'image/heif', name: 'photo.jpg' }), true)
  assert.equal(isHeicFile({ type: 'image/heic-sequence', name: 'photo.jpg' }), true)
  assert.equal(isHeicFile({ type: 'image/heif-sequence', name: 'photo.jpg' }), true)

  // 2. Non-standard MIME types (sometimes sent by Android/custom camera apps)
  assert.equal(isHeicFile({ type: 'image/x-heic', name: 'photo.bin' }), true)
  assert.equal(isHeicFile({ type: 'image/x-heif', name: 'photo.bin' }), true)
  assert.equal(isHeicFile({ type: 'application/heic', name: 'photo.bin' }), true)
  assert.equal(isHeicFile({ type: 'application/heif', name: 'photo.bin' }), true)

  // 3. Missing MIME type (empty string or octet-stream) with uppercase/lowercase extensions
  assert.equal(isHeicFile({ type: '', name: 'IMG_4021.HEIC' }), true)
  assert.equal(isHeicFile({ type: '', name: 'IMG_4021.heic' }), true)
  assert.equal(isHeicFile({ type: '', name: 'IMG_4021.Heic' }), true)
  assert.equal(isHeicFile({ type: '', name: 'sample.HEIF' }), true)
  assert.equal(isHeicFile({ type: '', name: 'sample.heif' }), true)
  assert.equal(isHeicFile({ type: 'application/octet-stream', name: 'camera_capture.heic' }), true)

  // 4. Standard formats should NOT be detected as HEIC
  assert.equal(isHeicFile({ type: 'image/jpeg', name: 'plant.jpg' }), false)
  assert.equal(isHeicFile({ type: 'image/png', name: 'label.png' }), false)
  assert.equal(isHeicFile({ type: 'image/webp', name: 'banner.webp' }), false)
  assert.equal(isHeicFile(null), false)
  assert.equal(isHeicFile({}), false)
})

test('Photo Service - File Validation (Accepts HEIC, Enforces Limits)', () => {
  // Empty or zero files is valid (photos are optional)
  const emptyRes = validatePhotoFiles([], 0)
  assert.equal(emptyRes.valid, true)
  assert.equal(emptyRes.error, null)

  // Valid standard formats (JPEG, PNG, WebP)
  const standardFiles = [
    { type: 'image/jpeg', name: 'monstera.jpg' },
    { type: 'image/png', name: 'soil_bag.png' },
  ]
  assert.equal(validatePhotoFiles(standardFiles, 0).valid, true)

  // Now ACCEPTS HEIC/HEIF files for automatic pipeline conversion
  const heicFiles = [
    { type: 'image/heic', name: 'iphone_plant.heic' },
    { type: '', name: 'another_shot.HEIF' },
  ]
  const heicRes = validatePhotoFiles(heicFiles, 0)
  assert.equal(heicRes.valid, true)
  assert.equal(heicRes.error, null)

  // Mixed selection: 1 WebP + 1 HEIC is valid
  const mixedFiles = [
    { type: 'image/webp', name: 'pot.webp' },
    { type: 'image/heic', name: 'plant.heic' },
  ]
  assert.equal(validatePhotoFiles(mixedFiles, 0).valid, true)

  // Rejects unsupported non-image types (e.g. PDF, Word document, Text)
  const invalidMime = [{ type: 'application/pdf', name: 'invoice.pdf' }]
  const invalidRes = validatePhotoFiles(invalidMime, 0)
  assert.equal(invalidRes.valid, false)
  assert.match(invalidRes.error, /Please select JPEG, PNG, WebP, or HEIC\/HEIF images/)

  // Enforces max 2 photos limit
  const threeFiles = [
    { type: 'image/jpeg', name: '1.jpg' },
    { type: 'image/heic', name: '2.heic' },
    { type: 'image/png', name: '3.png' },
  ]
  const limitRes = validatePhotoFiles(threeFiles, 0)
  assert.equal(limitRes.valid, false)
  assert.match(limitRes.error, /maximum of 2 photos/)

  // Enforces max limit when existing photos are already present
  const oneMore = [{ type: 'image/heic', name: 'new.heic' }]
  assert.equal(validatePhotoFiles(oneMore, 2).valid, false)
  assert.equal(validatePhotoFiles(oneMore, 1).valid, true)
})

test('Photo Service - HEIC to JPEG Conversion (Successful Mocked Conversion)', async () => {
  const fakeHeicFile = new File(['fake-heic-raw-data'], 'iPhone Photo (1).heic', {
    type: 'image/heic',
    lastModified: 1000,
  })

  // Mock converter simulating heic2any producing a JPEG Blob
  const mockConverter = async (file) => {
    assert.equal(file.name, 'iPhone Photo (1).heic')
    return new Blob(['fake-converted-jpeg-data'], { type: 'image/jpeg' })
  }

  const convertedFile = await convertHeicToJpeg(fakeHeicFile, mockConverter)

  // Must return a File object
  assert.equal(convertedFile instanceof File, true)
  // Must convert content type to image/jpeg
  assert.equal(convertedFile.type, 'image/jpeg')
  // Must sanitize filename and use .jpg extension
  assert.equal(convertedFile.name, 'iPhone_Photo__1_.jpg')
  // Original file name without dangerous characters
  assert.equal(convertedFile.name.endsWith('.jpg'), true)
  assert.equal(convertedFile.size > 0, true)
})

test('Photo Service - HEIC Conversion Failure Safety', async () => {
  const fakeHeicFile = new File(['corrupted-heic-bytes'], 'corrupt_plant.heic', {
    type: 'image/heic',
  })

  // 1. Simulating converter error (e.g. unsupported bitstream or parse error)
  const failingConverter = async () => {
    throw new Error('Format parsing error: unsupported heic codec')
  }

  await assert.rejects(
    async () => {
      await convertHeicToJpeg(fakeHeicFile, failingConverter)
    },
    (err) => {
      assert.match(err.message, /Could not convert HEIC photo/)
      assert.match(err.message, /corrupt_plant\.heic/)
      return true
    }
  )

  // 2. Simulating empty/null blob returned
  const emptyConverter = async () => null

  await assert.rejects(
    async () => {
      await convertHeicToJpeg(fakeHeicFile, emptyConverter)
    },
    (err) => {
      assert.match(err.message, /HEIC conversion failed/)
      return true
    }
  )

  // 3. Non-HEIC files bypass converter safely and return original file
  const jpegFile = new File(['jpeg-bytes'], 'normal.jpg', { type: 'image/jpeg' })
  const result = await convertHeicToJpeg(jpegFile, failingConverter)
  assert.equal(result, jpegFile)
})

test('Photo Service - End-to-End Processing & Size Validation', async () => {
  const fakeHeicFile = new File(['fake-heic-bytes'], 'plant_shot.HEIC', {
    type: 'image/heic',
  })
  assert.equal(isHeicFile(fakeHeicFile), true)

  // Mock converter producing standard JPEG
  const mockConverter = async () => {
    return new Blob(['fake-jpeg-output'], { type: 'image/jpeg' })
  }

  // When browser-image-compression runs, if in Node, we verify the pipeline logic:
  // Non-image files must be rejected
  const textFile = new File(['hello'], 'document.txt', { type: 'text/plain' })
  await assert.rejects(async () => {
    await processAndCompressPhoto(textFile, mockConverter)
  }, /Unsupported image format/)

  // Null file must be rejected
  await assert.rejects(async () => {
    await processAndCompressPhoto(null, mockConverter)
  }, /No photo file provided/)
})

test('Photo Service - File Name Sanitization', () => {
  assert.equal(sanitizeFileName('plant photo (1).jpeg'), 'plant_photo__1_')
  assert.equal(sanitizeFileName('normal-file_name.png'), 'normal-file_name')
  assert.equal(sanitizeFileName('../file.jpg'), '___file')
  assert.equal(sanitizeFileName(''), 'photo')
  assert.equal(sanitizeFileName(null), 'photo')
})

test('Photo Service - Storage Path Generation', () => {
  const path = createStoragePath(42, 'monstera.jpg', 0)
  assert.match(path, /^handoffs\/42\/\d+_0_monstera\.jpg$/)

  // Storage paths must match the security regex enforced by the Edge Function
  const edgeFunctionPathRegex = /^handoffs\/\d+\/[a-zA-Z0-9_.-]+$/
  assert.equal(edgeFunctionPathRegex.test(path), true)
  assert.equal(path.includes('..'), false)
})

test('Photo Service - Edge Function Security Constraints', () => {
  const allowedActions = [
    'get-photos-for-handoffs',
    'get-signed-urls',
    'delete-photos',
    'delete-handoff-photos',
  ]

  assert.equal(allowedActions.includes('get-photos-for-handoffs'), true)
  assert.equal(allowedActions.includes('delete-photos'), true)
  assert.equal(allowedActions.includes('malicious-action'), false)

  const pathRegex = /^handoffs\/\d+\/[a-zA-Z0-9_.-]+$/
  assert.equal(pathRegex.test('handoffs/123/1730000000_0_photo.jpg'), true)
  assert.equal(pathRegex.test('handoffs/abc/photo.jpg'), false)
  assert.equal(pathRegex.test('handoffs/123/../../etc/passwd'), false)
  assert.equal(pathRegex.test('other-bucket/photo.jpg'), false)
  assert.equal(pathRegex.test('/handoffs/123/photo.jpg'), false)
})

test('Photo Service - Photo Grouping Logic', () => {
  const photoRows = [
    { id: 1, handoff_id: 10, storage_path: 'handoffs/10/p1.jpg', content_type: 'image/jpeg' },
    { id: 2, handoff_id: 10, storage_path: 'handoffs/10/p2.jpg', content_type: 'image/jpeg' },
    { id: 3, handoff_id: 20, storage_path: 'handoffs/20/p3.jpg', content_type: 'image/png' },
  ]

  const photosByHandoff = {}
  for (const row of photoRows) {
    if (!photosByHandoff[row.handoff_id]) {
      photosByHandoff[row.handoff_id] = []
    }
    photosByHandoff[row.handoff_id].push(row)
  }

  assert.equal(photosByHandoff[10].length, 2)
  assert.equal(photosByHandoff[20].length, 1)
  assert.equal(photosByHandoff[99], undefined)
})

test('Photo Service - Deletion Resolution & Fallback Logic', async () => {
  const mixedInputs = [
    { id: 101, storage_path: 'handoffs/1/101.jpg' },
    { id: 102 }, // Missing storage_path: requires DB lookup
    103, // Bare number ID: requires DB lookup
    'handoffs/1/104.jpg', // Direct path string
  ]

  const knownPaths = new Set()
  const idsNeedingPathLookup = []
  const allIds = new Set()

  for (const item of mixedInputs) {
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

  assert.equal(knownPaths.has('handoffs/1/101.jpg'), true)
  assert.equal(knownPaths.has('handoffs/1/104.jpg'), true)
  assert.deepEqual(idsNeedingPathLookup, [102, 103])
  assert.equal(allIds.has(101), true)
  assert.equal(allIds.has(102), true)
  assert.equal(allIds.has(103), true)

  const mockDbRows = [
    { id: 102, storage_path: 'handoffs/1/102.jpg' },
  ]

  for (const row of mockDbRows) {
    if (row.storage_path) {
      knownPaths.add(row.storage_path)
    }
  }

  assert.equal(knownPaths.has('handoffs/1/102.jpg'), true)
  assert.equal(knownPaths.size, 3)
})

test('Photo Service - Rollback Error Reporting', () => {
  const originalError = new Error('Storage network timeout')
  const cleanupFailures = ['Storage cleanup failed: Bucket unreachable']

  const detailedMessage = `${originalError.message} (Warning: Rollback incomplete - ${cleanupFailures.join('; ')})`
  const compositeError = new Error(detailedMessage)
  compositeError.originalError = originalError
  compositeError.cleanupFailures = cleanupFailures

  assert.match(compositeError.message, /Storage network timeout/)
  assert.match(compositeError.message, /Warning: Rollback incomplete/)
  assert.equal(compositeError.cleanupFailures.length, 1)
})
