
import { useEffect, useState } from 'react'
import useSpeechRecognition from './useSpeechRecognition'
import detectCategory from './categoryDetector'

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
  }

  return <svg {...common}>{paths[name]}</svg>
}

function Handoff({
  onBack,
  onSave,
  editingHandoff = null,
}) {
  const [category, setCategory] = useState(
    editingHandoff?.category || 'General'
  )

  const [note, setNote] = useState(
    editingHandoff?.note || ''
  )

  const [createdBy, setCreatedBy] = useState(
    editingHandoff?.createdBy || ''
  )

  const [showDiscardConfirmation, setShowDiscardConfirmation] =
    useState(false)

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

  const hasUnsavedChanges = editingHandoff
    ? note.trim() !== originalNote.trim() ||
    category !== originalCategory
    : note.trim().length > 0

  useEffect(() => {
    if (!transcript.trim()) return

    setNote(transcript)

    const detectedCategory = detectCategory(transcript)
    setCategory(detectedCategory)
  }, [transcript])

  const handleMicrophone = () => {
    if (isListening) {
      stopListening()
      return
    }

    startListening()
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


  const handleSave = () => {
    if (!note.trim()) return
    if (!createdBy.trim()) return

    if (isListening) stopListening()

    const savedHandoff = {
      id: editingHandoff?.id ?? Date.now(),
      category,
      createdBy: createdBy.trim(),
      note: note.trim(),
      createdAt:
        editingHandoff?.createdAt || new Date().toISOString(),
    }

    onSave(savedHandoff)
  }


  return (
    <div className="handoff-screen">
      <header className="screen-header">
        <button
          type="button"
          className="back-button"
          onClick={handleBack}
          aria-label="Go back"
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

        <section className="note-section">
          <label htmlFor="handoff-note">
            Your note
          </label>

          <textarea
            id="handoff-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Example: We're running low on potting soil..."
            rows="6"
          />
        </section>

        <section className="created-by-section">
          <label htmlFor="handoff-created-by">Your name</label>

          <input
            id="handoff-created-by"
            type="text"
            value={createdBy}
            onChange={(event) => setCreatedBy(event.target.value)}
            placeholder="Enter your name"
            autoComplete="name"
            maxLength={60}
            required
          />
        </section>

        <section className="category-section">
          <label>Category</label>

          <div className="category-list">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                className={
                  category === item
                    ? 'category-button selected'
                    : 'category-button'
                }
                onClick={() => setCategory(item)}
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
          disabled={!note.trim()}
        >
          {editingHandoff ? 'Save Changes' : 'Save Handoff'}
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
