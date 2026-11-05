import { useEffect, useState, useRef } from 'react'
import useSpeechRecognition from './useSpeechRecognition'
import detectCategory from './categoryDetector'
import { useAuth } from './useAuth'
import {
  processAndCompressPhoto,
  validatePhotoFiles,
  isHeicFile,
  MAX_PHOTOS_PER_HANDOFF,
} from './photoService'

function Icon({ name, size = 22, strokeWidth = 1.8 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    focusable: 'false',
  }

  const paths = {
    back: <path d="m15 18-6-6 6-6M9 12h12" />,
    microphone: (
      <>
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" />
      </>
    ),
    stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
    camera: (
      <>
        <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
        <circle cx="12" cy="13" r="3" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="m19 6-1 14H6L5 6" />
      </>
    ),
    spinner: (
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    ),
    lock: (
      <>
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="10" cy="7" r="4" />
        <path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
  }

  return <svg {...common}>{paths[name] || paths.microphone}</svg>
}

const EMPLOYEE_NAMES = ['Carla', 'Anoushka', 'Chloe', 'Medina', 'Parul', 'Nikhil', 'Geet']
const OTHER_OPTION = '__other__'

function getEmployeeSelection(value) {
  return EMPLOYEE_NAMES.includes(value) ? value : value ? OTHER_OPTION : ''
}

function Handoff({
  onBack,
  onSave,
  onSavePrivateNote,
  editingHandoff = null,
}) {
  const { isAuthorized, profile } = useAuth()
  const [visibility, setVisibility] = useState('team') // 'team' | 'private'

  const [category, setCategory] = useState(
    editingHandoff?.category || 'General'
  )

  const [note, setNote] = useState(
    editingHandoff?.note || ''
  )

  const initialRecipient = editingHandoff?.recipient || ''
  const initialCreatedBy = editingHandoff?.createdBy || editingHandoff?.created_by || ''

  const [recipientSelection, setRecipientSelection] = useState(
    getEmployeeSelection(initialRecipient)
  )
  const [manualRecipient, setManualRecipient] = useState(
    getEmployeeSelection(initialRecipient) === OTHER_OPTION ? initialRecipient : ''
  )
  const [createdBySelection, setCreatedBySelection] = useState(
    getEmployeeSelection(initialCreatedBy)
  )
  const [manualCreatedBy, setManualCreatedBy] = useState(
    getEmployeeSelection(initialCreatedBy) === OTHER_OPTION ? initialCreatedBy : ''
  )

  const recipient = recipientSelection === OTHER_OPTION ? manualRecipient : recipientSelection
  const createdBy = createdBySelection === OTHER_OPTION ? manualCreatedBy : createdBySelection

  const [categoryManuallySelected, setCategoryManuallySelected] =
    useState(false)

  const [showDiscardConfirmation, setShowDiscardConfirmation] =
    useState(false)

  // Photo management state
  // existingPhotos: array of { id, storage_path, signedUrl, content_type }
  const [existingPhotos, setExistingPhotos] = useState(
    editingHandoff?.photos || []
  )
  const [removedPhotos, setRemovedPhotos] = useState([])
  // selectedPhotos: array of { file: File, previewUrl: string, name: string }
  const [selectedPhotos, setSelectedPhotos] = useState([])
  const [isCompressing, setIsCompressing] = useState(false)
  const [isConvertingHeic, setIsConvertingHeic] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const [saveError, setSaveError] = useState('')

  const fileInputRef = useRef(null)
  const selectedPhotosRef = useRef(selectedPhotos)

  useEffect(() => {
    selectedPhotosRef.current = selectedPhotos
  }, [selectedPhotos])

  const {
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
  } = useSpeechRecognition()

  const categories = [
    'General',
    'Plant Care',
    'Customer',
    'Stock',
    'Task',
    'Workshop',
  ]

  const originalNote = editingHandoff?.note || ''
  const originalCategory = editingHandoff?.category || 'General'
  const originalRecipient = editingHandoff?.recipient || ''
  const originalCreatedBy =
    editingHandoff?.createdBy || editingHandoff?.created_by || ''

  const totalPhotoCount = existingPhotos.length + selectedPhotos.length
  const maxReached = totalPhotoCount >= MAX_PHOTOS_PER_HANDOFF

  const hasUnsavedChanges = editingHandoff
    ? note.trim() !== originalNote.trim() ||
      category !== originalCategory ||
      recipient.trim() !== originalRecipient.trim() ||
      createdBy.trim() !== originalCreatedBy.trim() ||
      selectedPhotos.length > 0 ||
      removedPhotos.length > 0
    : visibility === 'private'
      ? note.trim().length > 0
      : note.trim().length > 0 ||
        recipient.trim().length > 0 ||
        createdBy.trim().length > 0 ||
        selectedPhotos.length > 0

  // Clean up object URLs on component unmount
  useEffect(() => {
    return () => {
      selectedPhotosRef.current.forEach((photo) => {
        if (photo.previewUrl) {
          URL.revokeObjectURL(photo.previewUrl)
        }
      })
    }
  }, [])

  useEffect(() => {
    if (!transcript.trim()) return

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNote(transcript)
    setCategoryManuallySelected(false)
    setCategory(detectCategory(transcript))
  }, [transcript])

  const handleMicrophone = () => {
    if (isListening) {
      stopListening()
      return
    }

    startListening()
  }

  const handlePhotoSelection = async (event) => {
    const rawFiles = Array.from(event.target.files || [])
    if (event.target) event.target.value = ''

    if (!rawFiles.length) return

    setPhotoError('')
    setSaveError('')

    const currentCount = existingPhotos.length + selectedPhotos.length

    // Validate files for HEIC, MIME types, and total count limit
    const validation = validatePhotoFiles(rawFiles, currentCount)
    if (!validation.valid) {
      setPhotoError(validation.error)
      return
    }

    const availableSlots = MAX_PHOTOS_PER_HANDOFF - currentCount
    const filesToProcess = rawFiles.slice(0, availableSlots)

    if (filesToProcess.length < rawFiles.length) {
      setPhotoError(`Only ${availableSlots} more photo can be added.`)
    }

    if (!filesToProcess.length) return

    const hasHeic = filesToProcess.some(isHeicFile)

    try {
      setIsCompressing(true)
      setIsConvertingHeic(hasHeic)

      const processedList = await Promise.all(
        filesToProcess.map(async (file) => {
          const processedFile = await processAndCompressPhoto(file)
          return {
            file: processedFile,
            previewUrl: URL.createObjectURL(processedFile),
            name: processedFile.name,
          }
        })
      )

      setSelectedPhotos((prev) => [...prev, ...processedList])
    } catch (err) {
      console.error('Photo processing error:', err)
      setPhotoError(
        err.message || 'Could not process these photos. Please try different images.'
      )
    } finally {
      setIsCompressing(false)
      setIsConvertingHeic(false)
    }
  }

  const handleRemoveNewPhoto = (indexToRemove) => {
    setSelectedPhotos((current) => {
      const photoToRemove = current[indexToRemove]
      if (photoToRemove?.previewUrl) {
        URL.revokeObjectURL(photoToRemove.previewUrl)
      }
      return current.filter((_, index) => index !== indexToRemove)
    })
    setPhotoError('')
  }

  const handleRemoveExistingPhoto = (photoToRemove) => {
    const targetId =
      typeof photoToRemove === 'object' && photoToRemove !== null
        ? photoToRemove.id
        : photoToRemove
    const fullPhoto =
      typeof photoToRemove === 'object' && photoToRemove?.storage_path
        ? photoToRemove
        : existingPhotos.find((p) => p.id === targetId)

    setExistingPhotos((current) => current.filter((p) => p.id !== targetId))
    if (fullPhoto) {
      setRemovedPhotos((current) => {
        if (current.some((p) => p.id === fullPhoto.id)) return current
        return [...current, fullPhoto]
      })
    }
    setPhotoError('')
  }

  const handleBack = () => {
    if (hasUnsavedChanges) {
      setShowDiscardConfirmation(true)
      return
    }

    if (isListening) stopListening()

    onBack()
  }

  const handleDiscard = () => {
    if (isListening) stopListening()

    setShowDiscardConfirmation(false)
    onBack()
  }

  const handleSave = async () => {
    if (visibility === 'private') {
      if (!note.trim() || isSaving) return
      if (isListening) stopListening()

      setIsSaving(true)
      setSaveError('')
      setPhotoError('')

      try {
        const result = await onSavePrivateNote?.({
          note: note.trim(),
          category,
        })
        if (result === false) {
          setIsSaving(false)
        }
      } catch (err) {
        console.error('Save private note failed:', err)
        setSaveError(
          err.message || 'Could not save private note. Please try again.'
        )
        setIsSaving(false)
      }
      return
    }

    if (!note.trim() || !createdBy.trim()) return
    if (isSaving || isCompressing) return

    if (isListening) stopListening()

    setIsSaving(true)
    setSaveError('')
    setPhotoError('')

    const payload = {
      id: editingHandoff?.id,
      category,
      recipient: recipient.trim(),
      createdBy: createdBy.trim(),
      note: note.trim(),
      createdAt: editingHandoff?.createdAt,
      newPhotos: selectedPhotos.map((p) => p.file),
      removedPhotos,
      existingPhotos,
    }

    try {
      const result = await onSave(payload)
      if (result === false) {
        setIsSaving(false)
      }
    } catch (err) {
      console.error('Save handoff failed:', err)
      setSaveError(
        err.message || 'Could not save handoff. Please check your connection and try again.'
      )
      setIsSaving(false)
    }
  }

  return (
    <div className="handoff-screen">
      <header className="screen-header">
        <button
          type="button"
          className="back-button"
          onClick={handleBack}
          aria-label="Go back"
          disabled={isSaving}
        >
          <Icon name="back" size={21} />
        </button>

        <div>
          <span className="screen-eyebrow">
            SHIFT HANDOFF
          </span>

          <h1>
            {editingHandoff ? 'Edit handoff' : 'Add a handoff'}
          </h1>
        </div>
      </header>

      <main className="handoff-content">
        <section className="handoff-intro">
          <button
            type="button"
            className={
              isListening
                ? 'large-mic-icon listening'
                : 'large-mic-icon'
            }
            onClick={handleMicrophone}
            aria-label={
              isListening ? 'Stop voice recording' : 'Start voice recording'
            }
            aria-pressed={isListening}
            disabled={isSaving}
          >
            <Icon
              name={isListening ? 'stop' : 'microphone'}
              size={28}
              strokeWidth={1.9}
            />
          </button>

          <h2>
            {isListening
              ? 'Listening...'
              : editingHandoff
                ? 'Correct this handoff'
                : 'What should the next shift know?'}
          </h2>

          <p>
            {isListening
              ? 'Speak naturally. Tap the button when you are finished.'
              : 'Tap the microphone or type a quick note.'}
          </p>

          {error && (
            <p className="speech-error">
              {error}
            </p>
          )}
        </section>

        {!editingHandoff && isAuthorized && (
          <section className="visibility-selector-section" aria-label="Note Visibility">
            <span className="visibility-label">Visibility</span>
            <div className="visibility-toggle-group" role="radiogroup">
              <button
                type="button"
                role="radio"
                aria-checked={visibility === 'team'}
                className={`visibility-toggle-btn ${visibility === 'team' ? 'active' : ''}`}
                onClick={() => setVisibility('team')}
                disabled={isSaving}
              >
                <Icon name="users" size={16} />
                <span>Team Handoff</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={visibility === 'private'}
                className={`visibility-toggle-btn ${visibility === 'private' ? 'active' : ''}`}
                onClick={() => setVisibility('private')}
                disabled={isSaving}
              >
                <Icon name="lock" size={16} />
                <span>Private Note</span>
              </button>
            </div>
            {visibility === 'private' && (
              <p className="visibility-helper-text">
                🔒 Personal to <strong>{profile?.name || 'Authorized Member'}</strong>. This note is strictly private and will never appear in team handoff history or on the shared dashboard.
              </p>
            )}
          </section>
        )}

        <section className="note-section">
          <label htmlFor="handoff-note">
            Your note
          </label>

          <textarea
            id="handoff-note"
            value={note}
            disabled={isSaving}
            onChange={(event) => {
              const typedNote = event.target.value
              setNote(typedNote)

              if (!categoryManuallySelected) {
                setCategory(detectCategory(typedNote))
              }
            }}
            placeholder="Example: We're running low on potting soil..."
            rows="6"
          />
        </section>

        {visibility === 'team' && (
          <section className="recipient-section">
            <label htmlFor="handoff-recipient">For (optional)</label>
            <select
              id="handoff-recipient"
              value={recipientSelection}
              disabled={isSaving}
              onChange={(event) => setRecipientSelection(event.target.value)}
            >
              <option value="">Select an employee</option>
              {EMPLOYEE_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}
              <option value={OTHER_OPTION}>Other (enter name)</option>
            </select>
            {recipientSelection === OTHER_OPTION && (
              <input
                id="handoff-recipient-other"
                type="text"
                value={manualRecipient}
                disabled={isSaving}
                onChange={(event) => setManualRecipient(event.target.value)}
                placeholder="Enter recipient name"
                autoComplete="off"
                maxLength={60}
              />
            )}
          </section>
        )}

        {visibility === 'team' && (
          <section className="created-by-section">
            <label htmlFor="handoff-created-by">Your name</label>
            <select
              id="handoff-created-by"
              value={createdBySelection}
              disabled={isSaving}
              onChange={(event) => setCreatedBySelection(event.target.value)}
              required
            >
              <option value="">Select your name</option>
              {EMPLOYEE_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}
              <option value={OTHER_OPTION}>Other (enter name)</option>
            </select>
            {createdBySelection === OTHER_OPTION && (
              <input
                id="handoff-created-by-other"
                type="text"
                value={manualCreatedBy}
                disabled={isSaving}
                onChange={(event) => setManualCreatedBy(event.target.value)}
                placeholder="Enter your name"
                autoComplete="name"
                maxLength={60}
                required
              />
            )}
          </section>
        )}

        {visibility === 'team' && (
          <section className="handoff-photos-section">
            <div className="photos-header">
              <label htmlFor="handoff-photos">
                Photos (optional, up to 2)
              </label>
              <span className="photos-count-badge" aria-live="polite">
                {totalPhotoCount} / {MAX_PHOTOS_PER_HANDOFF}
              </span>
            </div>

            <input
              ref={fileInputRef}
              id="handoff-photos"
              type="file"
              accept="image/jpeg,image/png,image/webp,.heic,.heif,image/heic,image/heif"
              multiple
              onChange={handlePhotoSelection}
              disabled={maxReached || isCompressing || isSaving}
              style={{ display: 'none' }}
            />

            <div className="photo-picker-row">
              <button
                type="button"
                className="photo-picker-button"
                onClick={() => fileInputRef.current?.click()}
                disabled={maxReached || isCompressing || isSaving}
              >
                <Icon name="camera" size={18} />
                <span>
                  {maxReached
                    ? 'Photo limit reached'
                    : totalPhotoCount === 1
                      ? 'Add 1 more photo'
                      : 'Choose photos'}
                </span>
              </button>

              <span className="photo-help-text">
                JPEG, PNG, WebP, or iPhone HEIC. Auto-converted & compressed under 1 MB.
              </span>
            </div>

            {isCompressing && (
              <div className="photo-loading-notice" role="status" aria-live="polite">
                <span className="spin-icon" aria-hidden="true">
                  <Icon name="spinner" size={16} />
                </span>
                <span>
                  {isConvertingHeic
                    ? 'Converting iPhone HEIC photo to JPEG and compressing...'
                    : 'Compressing and preparing photos...'}
                </span>
              </div>
            )}

            {photoError && (
              <p className="photo-error" role="alert">
                {photoError}
              </p>
            )}

            {saveError && (
              <p className="photo-error" role="alert">
                {saveError}
              </p>
            )}

            {totalPhotoCount > 0 && (
              <div className="handoff-photo-preview">
                {/* Existing photos from this handoff */}
                {existingPhotos.map((photo) => (
                  <div className="handoff-photo-item" key={`existing-${photo.id}`}>
                    <div className="photo-thumb-container">
                      <img
                        src={photo.signedUrl || ''}
                        alt="Attached handoff photo"
                        className="photo-thumb-img"
                      />
                      <span className="photo-status-badge">Saved</span>
                    </div>

                    <button
                      type="button"
                      className="photo-remove-btn"
                      onClick={() => handleRemoveExistingPhoto(photo)}
                      aria-label="Remove this photo"
                      disabled={isSaving}
                    >
                      <Icon name="trash" size={14} />
                      <span>Remove</span>
                    </button>
                  </div>
                ))}

                {/* Newly selected photos */}
                {selectedPhotos.map((photo, index) => (
                  <div className="handoff-photo-item" key={`new-${photo.name}-${index}`}>
                    <div className="photo-thumb-container">
                      <img
                        src={photo.previewUrl}
                        alt={`Selected attachment ${index + 1}`}
                        className="photo-thumb-img"
                      />
                      <span className="photo-status-badge new">New</span>
                    </div>

                    <button
                      type="button"
                      className="photo-remove-btn"
                      onClick={() => handleRemoveNewPhoto(index)}
                      aria-label={`Remove photo ${index + 1}`}
                      disabled={isSaving}
                    >
                      <Icon name="trash" size={14} />
                      <span>Remove</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <section className="category-section">
          <label>Category</label>

          <div className="category-list">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                disabled={isSaving}
                className={
                  category === item
                    ? 'category-button selected'
                    : 'category-button'
                }
                onClick={() => {
                  setCategory(item)
                  setCategoryManuallySelected(true)
                }}
              >
                {item}
              </button>
            ))}
          </div>
        </section>

        <button
          type="button"
          className="save-handoff"
          onClick={handleSave}
          disabled={
            visibility === 'private'
              ? !note.trim() || isSaving
              : !note.trim() || !createdBy.trim() || isCompressing || isSaving
          }
        >
          {isSaving ? (
            <span className="button-saving-content">
              <span className="spin-icon" aria-hidden="true">
                <Icon name="spinner" size={18} />
              </span>
              <span>Saving...</span>
            </span>
          ) : visibility === 'private' ? (
            'Save Private Note'
          ) : editingHandoff ? (
            'Save Changes'
          ) : (
            'Save Handoff'
          )}
        </button>
      </main>

      {showDiscardConfirmation && (
        <div
          className="discard-overlay"
          role="presentation"
        >
          <section
            className="discard-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="discard-title"
            aria-describedby="discard-description"
          >
            <h2 id="discard-title">
              Leave without saving?
            </h2>

            <p id="discard-description">
              {editingHandoff
                ? 'Your changes will be lost if you leave now.'
                : 'Your handoff note will be lost if you leave now.'}
            </p>

            <div className="discard-actions">
              <button
                type="button"
                className="keep-editing-button"
                onClick={() => setShowDiscardConfirmation(false)}
              >
                Keep editing
              </button>

              <button
                type="button"
                className="discard-button"
                onClick={handleDiscard}
              >
                Leave without saving
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

export default Handoff
