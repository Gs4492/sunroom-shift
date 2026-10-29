import { useState, useEffect, useCallback } from 'react'

function Icon({ name, size = 20 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }

  const icons = {
    back: (
      <>
        <path d="M19 12H5" />
        <path d="m12 19-7-7 7-7" />
      </>
    ),
    notes: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M8 13h8" />
        <path d="M8 17h8" />
        <path d="M8 9h2" />
      </>
    ),
    edit: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4Z" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="m19 6-1 14H6L5 6" />
        <path d="M10 11v5" />
        <path d="M14 11v5" />
      </>
    ),
    close: (
      <>
        <path d="M18 6 6 18M6 6l12 12" />
      </>
    ),
    image: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m21 15-5-5L5 21" />
      </>
    ),
    zoomIn: (
      <>
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3M11 8v6M8 11h6" />
      </>
    ),
  }

  return <svg {...common}>{icons[name] || icons.notes}</svg>
}

function HandoffHistory({
  handoffs,
  onBack,
  onDelete,
  onEdit,
  initialCategory = 'All',
}) {
  const [selectedCategory, setSelectedCategory] =
    useState(initialCategory)

  const [handoffToDelete, setHandoffToDelete] =
    useState(null)

  // Active photo for the lightbox enlargement modal
  const [activePhotoModal, setActivePhotoModal] = useState(null)

  // Track image load errors by photo ID
  const [failedPhotoIds, setFailedPhotoIds] = useState({})

  const categories = [
    'All',
    'Plant Care',
    'Customer',
    'Stock',
    'Task',
    'Workshop',
    'General',
  ]

  const formatDateTime = (dateString) => {
    const date = new Date(dateString)

    if (Number.isNaN(date.getTime())) {
      return 'Date unavailable'
    }

    return date.toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const filteredHandoffs =
    selectedCategory === 'All'
      ? handoffs
      : handoffs.filter(
        (handoff) => handoff.category === selectedCategory
      )

  const confirmDelete = () => {
    if (!handoffToDelete) return
    onDelete(handoffToDelete.id)
    setHandoffToDelete(null)
  }

  const handleImageError = (photoId) => {
    setFailedPhotoIds((prev) => ({ ...prev, [photoId]: true }))
  }

  // Handle ESC key to close enlarged photo modal
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        if (activePhotoModal) {
          setActivePhotoModal(null)
        } else if (handoffToDelete) {
          setHandoffToDelete(null)
        }
      }
    },
    [activePhotoModal, handoffToDelete]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="handoff-history-screen">
      <header className="screen-header">
        <button
          type="button"
          className="back-button"
          onClick={onBack}
          aria-label="Go back"
        >
          <Icon name="back" size={20} />
        </button>

        <div>
          <span className="screen-eyebrow">
            SHIFT NOTES
          </span>

          <h1>Handoff History</h1>
        </div>
      </header>

      <main className="history-content">
        <section className="history-intro">
          <h2>
            {selectedCategory === 'All'
              ? 'Everything from the shifts'
              : `${selectedCategory} notes`}
          </h2>

          <p>
            Review notes left by the team.
          </p>
        </section>

        <section
          className="history-filters"
          aria-label="Filter handoffs by category"
        >
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              className={
                selectedCategory === item
                  ? 'history-filter selected'
                  : 'history-filter'
              }
              aria-pressed={selectedCategory === item}
              onClick={() => setSelectedCategory(item)}
            >
              {item}
            </button>
          ))}
        </section>

        <section className="history-list">
          {filteredHandoffs.length === 0 ? (
            <div className="empty-history">
              <div className="empty-icon">
                <Icon name="notes" size={28} />
              </div>

              <h3>No handoffs here</h3>

              <p>
                There are no notes in this category yet.
              </p>
            </div>
          ) : (
            filteredHandoffs.map((handoff) => {
              const photos = handoff.photos || []

              return (
                <article
                  className="history-card"
                  key={handoff.id}
                >
                  <div className="history-card-top">
                    <span className="history-category">
                      {handoff.category}
                    </span>

                    <span className="history-time">
                      {handoff.createdAt
                        ? formatDateTime(handoff.createdAt)
                        : 'Earlier'}
                    </span>
                  </div>

                  <p className="history-note-text">{handoff.note}</p>

                  {/* Attached photo thumbnails */}
                  {photos.length > 0 && (
                    <div
                      className={`history-photos-grid count-${photos.length}`}
                      aria-label="Attached photos"
                    >
                      {photos.map((photo, index) => {
                        const isFailed = failedPhotoIds[photo.id] || !photo.signedUrl

                        return (
                          <div
                            className="history-photo-wrapper"
                            key={photo.id || `photo-${index}`}
                          >
                            {isFailed ? (
                              <div
                                className="history-photo-fallback"
                                role="note"
                                aria-label="Photo could not be loaded"
                              >
                                <Icon name="image" size={24} />
                                <span>Image unavailable</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="history-photo-thumb-button"
                                onClick={() =>
                                  setActivePhotoModal({
                                    url: photo.signedUrl,
                                    category: handoff.category,
                                    note: handoff.note,
                                    author: handoff.created_by,
                                  })
                                }
                                aria-label={`View enlarged photo ${index + 1}`}
                              >
                                <img
                                  src={photo.signedUrl}
                                  alt={`Attachment ${index + 1} for ${handoff.category} handoff`}
                                  className="history-photo-img"
                                  loading="lazy"
                                  onError={() => handleImageError(photo.id)}
                                />
                                <span className="photo-zoom-badge" aria-hidden="true">
                                  <Icon name="zoomIn" size={14} />
                                </span>
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {handoff.recipient && (
                    <div className="history-recipient">For {handoff.recipient}</div>
                  )}

                  {handoff.created_by && (
                    <div className="history-author">
                      Added by {handoff.created_by}
                    </div>
                  )}

                  <div className="handoff-card-actions">
                    <button
                      type="button"
                      className="edit-handoff-button"
                      onClick={() => onEdit(handoff)}
                    >
                      <Icon name="edit" size={16} />
                      <span>Edit note</span>
                    </button>

                    <button
                      type="button"
                      className="delete-handoff-button"
                      onClick={() => setHandoffToDelete(handoff)}
                    >
                      <Icon name="trash" size={16} />
                      <span>Delete note</span>
                    </button>
                  </div>
                </article>
              )
            })
          )}
        </section>
      </main>

      {/* Enlarged Photo Lightbox Modal */}
      {activePhotoModal && (
        <div
          className="photo-lightbox-overlay"
          onClick={() => setActivePhotoModal(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Enlarged photo preview"
        >
          <div
            className="photo-lightbox-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="photo-lightbox-close"
              onClick={() => setActivePhotoModal(null)}
              aria-label="Close enlarged photo"
            >
              <Icon name="close" size={24} />
            </button>

            <div className="photo-lightbox-img-box">
              <img
                src={activePhotoModal.url}
                alt="Enlarged handoff attachment"
                className="photo-lightbox-img"
              />
            </div>

            <div className="photo-lightbox-caption">
              <span className="caption-category">
                {activePhotoModal.category}
              </span>
              {activePhotoModal.author && (
                <span className="caption-author">
                  Added by {activePhotoModal.author}
                </span>
              )}
              {activePhotoModal.note && (
                <p className="caption-note">{activePhotoModal.note}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {handoffToDelete && (
        <div className="discard-overlay">
          <section
            className="discard-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-handoff-title"
            aria-describedby="delete-handoff-description"
          >
            <h2 id="delete-handoff-title">
              Delete this handoff?
            </h2>

            <p id="delete-handoff-description">
              This note and any attached photos will be permanently removed.
            </p>

            <div className="discard-actions">
              <button
                type="button"
                className="keep-editing-button"
                onClick={() => setHandoffToDelete(null)}
              >
                Keep note
              </button>

              <button
                type="button"
                className="discard-button"
                onClick={confirmDelete}
              >
                Delete permanently
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

export default HandoffHistory
