import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './useAuth'

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

  const paths = {
    back: <path d="m15 18-6-6 6-6M9 12h12" />,
    lock: (
      <>
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="m19 6-1 14H6L5 6" />
      </>
    ),
    edit: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4Z" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    check: <path d="m5 12 4 4L19 6" />,
    alert: (
      <>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </>
    ),
  }

  return <svg {...common}>{paths[name] || paths.lock}</svg>
}

const CATEGORIES = [
  'All',
  'General',
  'Plant Care',
  'Customer',
  'Stock',
  'Task',
  'Personal',
]

export default function PrivateNotes({ onBack, onShowMessage }) {
  const { user, profile, isAuthorized } = useAuth()
  const [notes, setNotes] = useState([])
  const [loadedUserId, setLoadedUserId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dbError, setDbError] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')

  // New note form state
  const [isAdding, setIsAdding] = useState(false)
  const [newNoteText, setNewNoteText] = useState('')
  const [newNoteCategory, setNewNoteCategory] = useState('General')
  const [savingNote, setSavingNote] = useState(false)

  // Edit note state
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [editCategory, setEditCategory] = useState('General')
  const [savingEdit, setSavingEdit] = useState(false)

  // Request cancellation and active user binding refs
  const loadVersionRef = useRef(0)
  const currentUserIdRef = useRef(user?.id || null)

  const loadPrivateNotes = useCallback(async () => {
    const version = ++loadVersionRef.current
    const targetUserId = user?.id || null

    if (!user || !isAuthorized || !targetUserId) {
      setNotes([])
      setLoadedUserId(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setDbError(null)

    try {
      const { data, error } = await supabase
        .from('private_notes')
        .select('*')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })

      // Discard stale in-flight responses if account changed or check superseded
      if (
        version !== loadVersionRef.current ||
        targetUserId !== currentUserIdRef.current ||
        !isAuthorized
      ) {
        return
      }

      if (error) {
        const isTableMissing =
          error.code === '42P01' ||
          error.code === 'PGRST204' ||
          error.code === 'PGRST205' ||
          error.code === 'PGRST200' ||
          error.status === 404 ||
          error.message?.toLowerCase().includes('relation') ||
          error.message?.toLowerCase().includes('does not exist')

        if (isTableMissing) {
          setDbError(
            'The private_notes database table does not exist yet. Please execute migration 20261105000100_create_private_notes_and_tasks.sql in the Supabase SQL Editor.'
          )
        } else {
          setDbError(error.message)
        }
        setNotes([])
        setLoadedUserId(null)
      } else {
        setNotes(data || [])
        setLoadedUserId(targetUserId)
      }
    } catch (err) {
      if (version !== loadVersionRef.current || targetUserId !== currentUserIdRef.current) return
      console.error('Error fetching private notes:', err)
      setDbError(err.message || 'Failed to load private notes.')
      setLoadedUserId(null)
    } finally {
      if (version === loadVersionRef.current && targetUserId === currentUserIdRef.current) {
        setLoading(false)
      }
    }
  }, [user, isAuthorized])

  // Synchronize component state with active authenticated user
  useEffect(() => {
    const activeId = user?.id || null

    // Immediately clear records if user identity changed or became unauthorized
    if (currentUserIdRef.current !== activeId || !isAuthorized) {
      currentUserIdRef.current = activeId
      setNotes([])
      setLoadedUserId(null)
      setEditingId(null)
      setDbError(null)
    }

    if (user && isAuthorized) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadPrivateNotes()
    } else {
      setLoading(false)
    }
  }, [user, isAuthorized, loadPrivateNotes])

  const handleCreateNote = async (e) => {
    e.preventDefault()
    if (!newNoteText.trim() || !user || !isAuthorized) return

    const actionUserId = user.id
    setSavingNote(true)
    try {
      const { data, error } = await supabase
        .from('private_notes')
        .insert({
          user_id: actionUserId,
          note: newNoteText.trim(),
          category: newNoteCategory,
        })
        .select()
        .single()

      // Discard response if account switched while mutation was in flight
      if (actionUserId !== currentUserIdRef.current || !isAuthorized) {
        return
      }

      if (error) {
        console.error('Error inserting private note:', error)
        onShowMessage?.(`Could not save private note: ${error.message}`)
      } else if (data) {
        setNotes((prev) => [data, ...prev])
        setNewNoteText('')
        setNewNoteCategory('General')
        setIsAdding(false)
        onShowMessage?.('Private note saved!')
      }
    } catch (err) {
      if (actionUserId !== currentUserIdRef.current) return
      console.error('Create note exception:', err)
      onShowMessage?.(`Failed to save private note: ${err.message}`)
    } finally {
      if (actionUserId === currentUserIdRef.current) {
        setSavingNote(false)
      }
    }
  }

  const handleStartEdit = (noteItem) => {
    setEditingId(noteItem.id)
    setEditText(noteItem.note)
    setEditCategory(noteItem.category || 'General')
  }

  const handleSaveEdit = async (id) => {
    if (!editText.trim() || !user || !isAuthorized) return

    const actionUserId = user.id
    setSavingEdit(true)
    try {
      const { data, error } = await supabase
        .from('private_notes')
        .update({
          note: editText.trim(),
          category: editCategory,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', actionUserId)
        .select()
        .single()

      if (actionUserId !== currentUserIdRef.current || !isAuthorized) {
        return
      }

      if (error) {
        console.error('Error updating private note:', error)
        onShowMessage?.(`Could not update private note: ${error.message}`)
      } else if (data) {
        setNotes((prev) => prev.map((n) => (n.id === id ? data : n)))
        setEditingId(null)
        onShowMessage?.('Private note updated!')
      }
    } catch (err) {
      if (actionUserId !== currentUserIdRef.current) return
      console.error('Update note exception:', err)
      onShowMessage?.(`Failed to update private note: ${err.message}`)
    } finally {
      if (actionUserId === currentUserIdRef.current) {
        setSavingEdit(false)
      }
    }
  }

  const handleDelete = async (id) => {
    if (!user || !isAuthorized) return
    if (!window.confirm('Are you sure you want to delete this private note?')) return

    const actionUserId = user.id
    try {
      const { error } = await supabase
        .from('private_notes')
        .delete()
        .eq('id', id)
        .eq('user_id', actionUserId)

      if (actionUserId !== currentUserIdRef.current || !isAuthorized) {
        return
      }

      if (error) {
        console.error('Error deleting private note:', error)
        onShowMessage?.(`Could not delete private note: ${error.message}`)
      } else {
        setNotes((prev) => prev.filter((n) => n.id !== id))
        onShowMessage?.('Private note deleted.')
      }
    } catch (err) {
      if (actionUserId !== currentUserIdRef.current) return
      console.error('Delete note exception:', err)
      onShowMessage?.(`Failed to delete private note: ${err.message}`)
    }
  }

  // Safe display: guarantee records cannot be shown if user identity does not match
  const isDisplayAllowed = Boolean(user && isAuthorized && loadedUserId === user.id)
  const safeNotes = isDisplayAllowed ? notes : []

  const filteredNotes = safeNotes.filter((item) => {
    const matchesCat =
      selectedCategory === 'All' ||
      item.category?.toLowerCase() === selectedCategory.toLowerCase()

    const matchesQuery =
      !searchQuery.trim() ||
      item.note.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
      item.category?.toLowerCase().includes(searchQuery.toLowerCase().trim())

    return matchesCat && matchesQuery
  })

  return (
    <div className="tasks-screen">
      <div className="screen-header">
        <button
          type="button"
          className="back-button"
          onClick={onBack}
          aria-label="Back to home"
        >
          <Icon name="back" size={20} />
        </button>
        <div className="screen-header-text">
          <span className="screen-eyebrow">
            🔒 PRIVATE VAULT — {profile?.name || 'Authorized Member'}
          </span>
          <h2>Private Notes</h2>
        </div>
      </div>

      <div className="tasks-content">
        {dbError && (
          <div className="auth-alert warning" role="alert" style={{ marginBottom: 16 }}>
            <Icon name="alert" size={18} />
            <div>
              <strong>Database Warning:</strong>
              <p style={{ margin: '4px 0 0', fontSize: 13 }}>{dbError}</p>
            </div>
          </div>
        )}

        {/* Category Filters */}
        <div className="private-filters-section">
          <div className="task-filter-tabs" role="tablist" aria-label="Note categories">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={selectedCategory === cat}
                className={`task-tab-btn ${selectedCategory === cat ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="private-search-bar">
            <Icon name="search" size={16} />
            <input
              type="search"
              placeholder="Search private notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search private notes"
            />
          </div>
        </div>

        {/* Add Note Section */}
        <section className="add-task-section">
          {!isAdding ? (
            <button
              type="button"
              className="add-task-submit-button"
              onClick={() => setIsAdding(true)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <Icon name="plus" size={18} />
              <span>Add New Private Note</span>
            </button>
          ) : (
            <form onSubmit={handleCreateNote} className="private-note-form">
              <label htmlFor="new-private-note" className="private-label">
                Note Details (Personal to you)
              </label>
              <textarea
                id="new-private-note"
                rows={3}
                className="private-textarea"
                placeholder="Write your personal thoughts, confidential plans, or reorder reminders..."
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                autoFocus
                required
              />

              <div className="private-form-row">
                <label htmlFor="new-note-cat" className="private-label">Category:</label>
                <select
                  id="new-note-cat"
                  className="private-select"
                  value={newNoteCategory}
                  onChange={(e) => setNewNoteCategory(e.target.value)}
                >
                  {CATEGORIES.filter((c) => c !== 'All').map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="private-form-actions">
                <button
                  type="submit"
                  className="add-task-submit-button"
                  disabled={savingNote || !newNoteText.trim()}
                >
                  {savingNote ? 'Saving...' : 'Save Private Note'}
                </button>
                <button
                  type="button"
                  className="auth-btn auth-btn-secondary"
                  onClick={() => {
                    setIsAdding(false)
                    setNewNoteText('')
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </section>

        {/* Notes List */}
        <div className="private-notes-list">
          {loading ? (
            <p className="loading-state">Loading confidential notes...</p>
          ) : filteredNotes.length === 0 ? (
            <div className="private-empty-state">
              <Icon name="lock" size={32} />
              <p>
                {searchQuery || selectedCategory !== 'All'
                  ? 'No private notes match your current filter.'
                  : 'No private notes yet. Your notes are strictly personal and never visible to the rest of the team.'}
              </p>
            </div>
          ) : (
            filteredNotes.map((noteItem) => (
              <div
                key={noteItem.id}
                className={`private-note-card ${editingId === noteItem.id ? 'editing' : ''}`}
              >
                {editingId === noteItem.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      handleSaveEdit(noteItem.id)
                    }}
                    className="private-edit-form"
                  >
                    <textarea
                      rows={3}
                      className="private-textarea"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      required
                    />
                    <div className="private-form-row" style={{ marginTop: 8 }}>
                      <label className="private-label">Category:</label>
                      <select
                        className="private-select"
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value)}
                      >
                        {CATEGORIES.filter((c) => c !== 'All').map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div className="private-form-actions">
                      <button
                        type="submit"
                        className="add-task-submit-button"
                        disabled={savingEdit || !editText.trim()}
                      >
                        {savingEdit ? 'Updating...' : 'Save'}
                      </button>
                      <button
                        type="button"
                        className="auth-btn auth-btn-secondary"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="private-note-header">
                      <span className="badge-category">{noteItem.category || 'General'}</span>
                      <span className="private-note-date">
                        {new Date(noteItem.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                    <p className="private-note-text">{noteItem.note}</p>
                    <div className="private-note-actions">
                      <button
                        type="button"
                        className="private-action-icon-btn"
                        onClick={() => handleStartEdit(noteItem)}
                        aria-label="Edit private note"
                      >
                        <Icon name="edit" size={15} />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        className="private-action-icon-btn danger"
                        onClick={() => handleDelete(noteItem.id)}
                        aria-label="Delete private note"
                      >
                        <Icon name="trash" size={15} />
                        <span>Delete</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
