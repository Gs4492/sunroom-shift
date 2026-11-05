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
    clock: (
      <>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </>
    ),
  }

  return <svg {...common}>{paths[name] || paths.lock}</svg>
}

function formatDueDate(dateString) {
  if (!dateString) return ''
  const cleanDate = String(dateString).split('T')[0]
  const [year, month, day] = cleanDate.split('-').map(Number)
  if (!year || !month || !day) return ''
  const date = new Date(year, month - 1, day)
  if (Number.isNaN(date.getTime())) return ''

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export default function PrivateTasks({ onBack, onShowMessage }) {
  const { user, profile, isAuthorized } = useAuth()
  const [tasks, setTasks] = useState([])
  const [loadedUserId, setLoadedUserId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dbError, setDbError] = useState(null)
  const [filterMode, setFilterMode] = useState('open') // 'open' | 'completed' | 'all'
  const [searchQuery, setSearchQuery] = useState('')

  // New task form state
  const [isAdding, setIsAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newPriority, setNewPriority] = useState('normal')
  const [newDueDate, setNewDueDate] = useState('')
  const [savingTask, setSavingTask] = useState(false)

  // Edit task state
  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editPriority, setEditPriority] = useState('normal')
  const [editDueDate, setEditDueDate] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // Request cancellation and active user binding refs
  const loadVersionRef = useRef(0)
  const currentUserIdRef = useRef(user?.id || null)

  const loadPrivateTasks = useCallback(async () => {
    const version = ++loadVersionRef.current
    const targetUserId = user?.id || null

    if (!user || !isAuthorized || !targetUserId) {
      setTasks([])
      setLoadedUserId(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setDbError(null)

    try {
      const { data, error } = await supabase
        .from('private_tasks')
        .select('*')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })

      // Discard stale in-flight response if account changed or check superseded
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
            'The private_tasks database table does not exist yet. Please execute migration 20261105000100_create_private_notes_and_tasks.sql in the Supabase SQL Editor.'
          )
        } else {
          setDbError(error.message)
        }
        setTasks([])
        setLoadedUserId(null)
      } else {
        setTasks(data || [])
        setLoadedUserId(targetUserId)
      }
    } catch (err) {
      if (version !== loadVersionRef.current || targetUserId !== currentUserIdRef.current) return
      console.error('Error fetching private tasks:', err)
      setDbError(err.message || 'Failed to load private tasks.')
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
      setTasks([])
      setLoadedUserId(null)
      setEditingId(null)
      setDbError(null)
    }

    if (user && isAuthorized) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadPrivateTasks()
    } else {
      setLoading(false)
    }
  }, [user, isAuthorized, loadPrivateTasks])

  const handleCreateTask = async (e) => {
    e.preventDefault()
    if (!newTitle.trim() || !user || !isAuthorized) return

    const actionUserId = user.id
    setSavingTask(true)
    try {
      const { data, error } = await supabase
        .from('private_tasks')
        .insert({
          user_id: actionUserId,
          title: newTitle.trim(),
          priority: newPriority,
          due_date: newDueDate || null,
          completed: false,
        })
        .select()
        .single()

      if (actionUserId !== currentUserIdRef.current || !isAuthorized) {
        return
      }

      if (error) {
        console.error('Error inserting private task:', error)
        onShowMessage?.(`Could not save private task: ${error.message}`)
      } else if (data) {
        setTasks((prev) => [data, ...prev])
        setNewTitle('')
        setNewPriority('normal')
        setNewDueDate('')
        setIsAdding(false)
        onShowMessage?.('Private task added!')
      }
    } catch (err) {
      if (actionUserId !== currentUserIdRef.current) return
      console.error('Create task exception:', err)
      onShowMessage?.(`Failed to save private task: ${err.message}`)
    } finally {
      if (actionUserId === currentUserIdRef.current) {
        setSavingTask(false)
      }
    }
  }

  const handleToggleTask = async (taskItem) => {
    if (!user || !isAuthorized) return

    const actionUserId = user.id
    const nextCompleted = !taskItem.completed
    try {
      const { data, error } = await supabase
        .from('private_tasks')
        .update({
          completed: nextCompleted,
          completed_at: nextCompleted ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskItem.id)
        .eq('user_id', actionUserId)
        .select()
        .single()

      if (actionUserId !== currentUserIdRef.current || !isAuthorized) {
        return
      }

      if (error) {
        console.error('Error updating task completion:', error)
        onShowMessage?.(`Could not update task: ${error.message}`)
      } else if (data) {
        setTasks((prev) => prev.map((t) => (t.id === taskItem.id ? data : t)))
      }
    } catch (err) {
      if (actionUserId !== currentUserIdRef.current) return
      console.error('Toggle task exception:', err)
    }
  }

  const handleStartEdit = (taskItem) => {
    setEditingId(taskItem.id)
    setEditTitle(taskItem.title)
    setEditPriority(taskItem.priority || 'normal')
    setEditDueDate(taskItem.due_date || '')
  }

  const handleSaveEdit = async (id) => {
    if (!editTitle.trim() || !user || !isAuthorized) return

    const actionUserId = user.id
    setSavingEdit(true)
    try {
      const { data, error } = await supabase
        .from('private_tasks')
        .update({
          title: editTitle.trim(),
          priority: editPriority,
          due_date: editDueDate || null,
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
        console.error('Error saving task edit:', error)
        onShowMessage?.(`Could not update task: ${error.message}`)
      } else if (data) {
        setTasks((prev) => prev.map((t) => (t.id === id ? data : t)))
        setEditingId(null)
        onShowMessage?.('Private task updated!')
      }
    } catch (err) {
      if (actionUserId !== currentUserIdRef.current) return
      console.error('Update task exception:', err)
      onShowMessage?.(`Failed to update task: ${err.message}`)
    } finally {
      if (actionUserId === currentUserIdRef.current) {
        setSavingEdit(false)
      }
    }
  }

  const handleDelete = async (id) => {
    if (!user || !isAuthorized) return
    if (!window.confirm('Delete this private task?')) return

    const actionUserId = user.id
    try {
      const { error } = await supabase
        .from('private_tasks')
        .delete()
        .eq('id', id)
        .eq('user_id', actionUserId)

      if (actionUserId !== currentUserIdRef.current || !isAuthorized) {
        return
      }

      if (error) {
        console.error('Error deleting task:', error)
        onShowMessage?.(`Could not delete task: ${error.message}`)
      } else {
        setTasks((prev) => prev.filter((t) => t.id !== id))
        onShowMessage?.('Private task deleted.')
      }
    } catch (err) {
      if (actionUserId !== currentUserIdRef.current) return
      console.error('Delete task exception:', err)
      onShowMessage?.(`Failed to delete task: ${err.message}`)
    }
  }

  // Safe display: guarantee records cannot be shown if user identity does not match
  const isDisplayAllowed = Boolean(user && isAuthorized && loadedUserId === user.id)
  const safeTasks = isDisplayAllowed ? tasks : []

  const filteredTasks = safeTasks.filter((task) => {
    if (filterMode === 'open' && task.completed) return false
    if (filterMode === 'completed' && !task.completed) return false

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      return (
        task.title.toLowerCase().includes(query) ||
        (task.priority && task.priority.toLowerCase().includes(query))
      )
    }

    return true
  })

  const openCount = safeTasks.filter((t) => !t.completed).length
  const completedCount = safeTasks.filter((t) => t.completed).length

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
          <h2>Private Tasks</h2>
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

        {/* Filter Tabs & Search */}
        <div className="private-filters-section">
          <div className="task-filter-tabs" role="tablist" aria-label="Task filters">
            <button
              type="button"
              role="tab"
              aria-selected={filterMode === 'open'}
              className={`task-tab-btn ${filterMode === 'open' ? 'active' : ''}`}
              onClick={() => setFilterMode('open')}
            >
              Open ({openCount})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filterMode === 'completed'}
              className={`task-tab-btn ${filterMode === 'completed' ? 'active' : ''}`}
              onClick={() => setFilterMode('completed')}
            >
              Completed ({completedCount})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filterMode === 'all'}
              className={`task-tab-btn ${filterMode === 'all' ? 'active' : ''}`}
              onClick={() => setFilterMode('all')}
            >
              All ({safeTasks.length})
            </button>
          </div>

          <div className="private-search-bar">
            <Icon name="search" size={16} />
            <input
              type="search"
              placeholder="Search private tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search private tasks"
            />
          </div>
        </div>

        {/* Add Task Section */}
        <section className="add-task-section">
          {!isAdding ? (
            <button
              type="button"
              className="add-task-submit-button"
              onClick={() => setIsAdding(true)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <Icon name="plus" size={18} />
              <span>Add New Private Task</span>
            </button>
          ) : (
            <form onSubmit={handleCreateTask} className="private-task-form">
              <label htmlFor="new-private-task-title" className="private-label">
                Task Title (Personal to you)
              </label>
              <input
                id="new-private-task-title"
                type="text"
                placeholder="What personal task do you need to do?"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                autoFocus
                required
              />

              <div className="task-planning-fields" style={{ marginTop: 8 }}>
                <div className="task-priority-field">
                  <label htmlFor="new-private-priority">Priority</label>
                  <select
                    id="new-private-priority"
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                  >
                    <option value="low">Low Priority</option>
                    <option value="normal">Normal Priority</option>
                    <option value="high">High Priority</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div className="task-due-date-field">
                  <label htmlFor="new-private-due-date">Due Date</label>
                  <input
                    id="new-private-due-date"
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="private-form-actions" style={{ marginTop: 12 }}>
                <button
                  type="submit"
                  className="add-task-submit-button"
                  disabled={savingTask || !newTitle.trim()}
                >
                  {savingTask ? 'Saving...' : 'Add Private Task'}
                </button>
                <button
                  type="button"
                  className="auth-btn auth-btn-secondary"
                  onClick={() => {
                    setIsAdding(false)
                    setNewTitle('')
                    setNewDueDate('')
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </section>

        {/* Tasks List */}
        <div className="private-tasks-list">
          {loading ? (
            <p className="loading-state">Loading personal tasks...</p>
          ) : filteredTasks.length === 0 ? (
            <div className="private-empty-state">
              <Icon name="lock" size={32} />
              <p>
                {searchQuery || filterMode !== 'open'
                  ? 'No private tasks match your filter.'
                  : 'No personal tasks on your list. Private tasks cannot be assigned to other employees.'}
              </p>
            </div>
          ) : (
            filteredTasks.map((taskItem) => (
              <div
                key={taskItem.id}
                className={`private-task-item ${taskItem.completed ? 'completed' : ''} ${
                  editingId === taskItem.id ? 'editing' : ''
                }`}
              >
                {editingId === taskItem.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      handleSaveEdit(taskItem.id)
                    }}
                    className="private-edit-form"
                    style={{ width: '100%' }}
                  >
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      required
                    />
                    <div className="task-planning-fields" style={{ marginTop: 8 }}>
                      <div className="task-priority-field">
                        <label>Priority</label>
                        <select
                          value={editPriority}
                          onChange={(e) => setEditPriority(e.target.value)}
                        >
                          <option value="low">Low Priority</option>
                          <option value="normal">Normal Priority</option>
                          <option value="high">High Priority</option>
                          <option value="urgent">Urgent</option>
                        </select>
                      </div>
                      <div className="task-due-date-field">
                        <label>Due Date</label>
                        <input
                          type="date"
                          value={editDueDate}
                          onChange={(e) => setEditDueDate(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="private-form-actions" style={{ marginTop: 10 }}>
                      <button
                        type="submit"
                        className="add-task-submit-button"
                        disabled={savingEdit || !editTitle.trim()}
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
                    <button
                      type="button"
                      className={`private-checkbox ${taskItem.completed ? 'checked' : ''}`}
                      onClick={() => handleToggleTask(taskItem)}
                      aria-label={taskItem.completed ? 'Mark uncompleted' : 'Mark completed'}
                    >
                      {taskItem.completed && <Icon name="check" size={14} />}
                    </button>
                    <div className="private-task-content">
                      <span className="private-task-title">{taskItem.title}</span>
                      <div className="private-task-meta">
                        {taskItem.priority && taskItem.priority !== 'normal' && (
                          <span className={`priority-tag priority-${taskItem.priority}`}>
                            {taskItem.priority.toUpperCase()}
                          </span>
                        )}
                        {taskItem.due_date && (
                          <span className="private-task-due">
                            <Icon name="clock" size={12} />
                            <span>{formatDueDate(taskItem.due_date)}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="private-note-actions" style={{ borderTop: 'none', padding: 0 }}>
                      <button
                        type="button"
                        className="private-action-icon-btn"
                        onClick={() => handleStartEdit(taskItem)}
                        aria-label="Edit task"
                      >
                        <Icon name="edit" size={15} />
                      </button>
                      <button
                        type="button"
                        className="private-action-icon-btn danger"
                        onClick={() => handleDelete(taskItem.id)}
                        aria-label="Delete task"
                      >
                        <Icon name="trash" size={15} />
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
