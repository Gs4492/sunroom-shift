import { useState } from 'react'

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
  }

  return <svg {...common}>{icons[name]}</svg>
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
    if (!handoffToDelete) {
      return
    }

    onDelete(handoffToDelete.id)
    setHandoffToDelete(null)
  }

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
            filteredHandoffs.map((handoff) => (
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

                <p>{handoff.note}</p>

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
            ))
          )}
        </section>
      </main>

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
              This note will be permanently removed from this app.
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
