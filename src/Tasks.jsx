
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
    check: <path d="m5 12 4 4L19 6" />,
  }

  return <svg {...common}>{icons[name]}</svg>
}

function getTodayDate() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function formatDueDate(dateString) {
  if (!dateString) return ''

  const [year, month, day] = dateString.split('-').map(Number)
  const date = new Date(year, month - 1, day)

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: year !== new Date().getFullYear() ? 'numeric' : undefined,
  })
}

function isTaskOverdue(task) {
  return Boolean(
    !task.completed &&
    task.due_date &&
    task.due_date < getTodayDate()
  )
}

function Tasks({ tasks, onBack, onAddTask, onToggleTask, onUpdateTask }) {
  const [newTask, setNewTask] = useState('')
  const [assignMode, setAssignMode] = useState('self')
  const [otherAssignee, setOtherAssignee] = useState('')
  const [createdBy, setCreatedBy] = useState('')
  const [priority, setPriority] = useState('normal')
  const [dueDate, setDueDate] = useState('')
  const [showAllCompleted, setShowAllCompleted] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [visibleOpenCount, setVisibleOpenCount] = useState(10)

  const [editingTask, setEditingTask] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editAssignee, setEditAssignee] = useState('')
  const [editPriority, setEditPriority] = useState('normal')
  const [editDueDate, setEditDueDate] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const handleAddTask = () => {
    if (!newTask.trim() || !createdBy.trim()) {
      return
    }

    const assignedTo =
      assignMode === 'self'
        ? createdBy.trim()
        : assignMode === 'other'
          ? otherAssignee.trim()
          : null

    if (assignMode === 'other' && !otherAssignee.trim()) {
      return
    }

    onAddTask({
      title: newTask.trim(),
      createdBy: createdBy.trim(),
      assignedTo,
      priority,
      dueDate: dueDate || null,
    })

    setNewTask('')
    setCreatedBy('')
    setOtherAssignee('')
    setAssignMode('self')
    setPriority('normal')
    setDueDate('')
  }


  const handleStartEdit = (task) => {
    setEditingTask(task)
    setEditTitle(task.title || '')
    setEditAssignee(task.assigned_to || '')
    setEditPriority(task.priority || 'normal')
    setEditDueDate(task.due_date || '')
  }

  const handleCancelEdit = () => {
    setEditingTask(null)
    setEditTitle('')
    setEditAssignee('')
    setEditPriority('normal')
    setEditDueDate('')
    setSavingEdit(false)
  }

  const handleSaveEdit = async () => {
    if (!editingTask || !editTitle.trim() || savingEdit) return

    setSavingEdit(true)

    try {
      const saved = await onUpdateTask(editingTask.id, {
        title: editTitle.trim(),
        assignedTo: editAssignee.trim() || null,
        priority: editPriority,
        dueDate: editDueDate || null,
      })

      if (saved) {
        handleCancelEdit()
      }
    } finally {
      setSavingEdit(false)
    }
  }


  const handleToggleTask = (task) => {
    const action = task.completed ? 'reopen' : 'complete'
    const assignee = task.assigned_to
    const creator = task.created_by || task.createdBy

    const message =
      action === 'complete'
        ? assignee
          ? `Mark "${task.title}" as completed for ${assignee}?`
          : `Mark "${task.title}" as completed? Added by ${creator || 'Unknown'}.`
        : `Reopen "${task.title}"?`

    if (window.confirm(message)) {
      onToggleTask(task.id)
    }
  }

  const openTasks = tasks.filter((task) => !task.completed)
  const completedTasks = tasks.filter((task) => task.completed)
  const overdueTasks = openTasks.filter(isTaskOverdue)

  const filteredOpenTasks = openTasks.filter((task) => {
    const query = searchQuery.trim().toLowerCase()
    const taskPriority = (task.priority || 'normal').toLowerCase()

    const matchesPriority =
      priorityFilter === 'all' || taskPriority === priorityFilter

    if (!matchesPriority) return false
    if (!query) return true

    const title = (task.title || '').toLowerCase()
    const author = (task.created_by || task.createdBy || '').toLowerCase()
    const assignee = (task.assigned_to || task.assignedTo || '').toLowerCase()
    const taskDueDate = (task.due_date || '').toLowerCase()

    return (
      title.includes(query) ||
      author.includes(query) ||
      assignee.includes(query) ||
      taskPriority.includes(query) ||
      taskDueDate.includes(query)
    )
  })

  const visibleOpenTasks = filteredOpenTasks.slice(0, visibleOpenCount)

  const visibleCompletedTasks = showAllCompleted
    ? completedTasks
    : completedTasks.slice(0, 5)

  return (
    <div className="tasks-screen">
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
          <span className="screen-eyebrow">SHIFT TASKS</span>
          <h1>Tasks</h1>
        </div>
      </header>

      <main className="tasks-content">
        <section className="tasks-intro">
          <h2>What needs to get done?</h2>
          <p>Keep track of tasks for the shop and the next shift.</p>
        </section>

        <section className="add-task-section">
          <input
            type="text"
            value={newTask}
            onChange={(event) => setNewTask(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleAddTask()
            }}
            placeholder="Add a task..."
            aria-label="New task"
          />

          <input
            type="text"
            value={createdBy}
            onChange={(event) => setCreatedBy(event.target.value)}
            placeholder="Your name"
            aria-label="Your name"
            maxLength={60}
          />

          <div className="task-assignment">
            <label htmlFor="assignMode">Assign to</label>

            <select
              id="assignMode"
              value={assignMode}
              onChange={(event) => setAssignMode(event.target.value)}
            >
              <option value="self">Myself</option>
              <option value="other">Someone else</option>
              <option value="none">Unassigned</option>
            </select>

            {assignMode === 'other' && (
              <input
                type="text"
                value={otherAssignee}
                onChange={(event) => setOtherAssignee(event.target.value)}
                placeholder="Enter assignee's name"
                aria-label="Assignee's name"
                maxLength={60}
              />
            )}
          </div>

          <div className="task-planning-fields">
            <div className="task-priority-field">
              <label htmlFor="taskPriority">Priority</label>
              <select
                id="taskPriority"
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
              >
                <option value="urgent">Urgent</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div className="task-due-date-field">
              <label htmlFor="taskDueDate">Due date (optional)</label>
              <input
                id="taskDueDate"
                type="date"
                value={dueDate}
                min={getTodayDate()}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddTask}
            disabled={
              !newTask.trim() ||
              !createdBy.trim() ||
              (assignMode === 'other' && !otherAssignee.trim())
            }
          >
            Add
          </button>
        </section>

        <section className="task-section">
          <div className="task-section-heading">
            <h3>Open Tasks</h3>
            <span>{openTasks.length}</span>
          </div>

          {overdueTasks.length > 0 && (
            <p className="task-overdue-summary" role="status">
              {overdueTasks.length} overdue{' '}
              {overdueTasks.length === 1 ? 'task' : 'tasks'} need attention.
            </p>
          )}

          <div className="task-list">
            <div className="task-search-controls">
              <input
                type="search"
                className="task-search"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value)
                  setVisibleOpenCount(10)
                }}
                placeholder="Search tasks or names..."
                aria-label="Search open tasks"
              />

              <select
                className="task-priority-filter"
                value={priorityFilter}
                onChange={(event) => {
                  setPriorityFilter(event.target.value)
                  setVisibleOpenCount(10)
                }}
                aria-label="Filter tasks by priority"
              >
                <option value="all">All priorities</option>
                <option value="urgent">Urgent</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </select>
            </div>

            {openTasks.length === 0 ? (
              <div className="empty-tasks">
                <div className="empty-task-icon">
                  <Icon name="check" size={22} />
                </div>
                <p>Nothing needs to be done right now.</p>
              </div>
            ) : filteredOpenTasks.length === 0 ? (
              <div className="empty-tasks">
                <p>No tasks match your search.</p>
              </div>
            ) : (
              visibleOpenTasks.map((task) => {
                const overdue = isTaskOverdue(task)
                const taskPriority = task.priority || 'normal'


                return (
                  <div
                    className={`task-card-wrapper${overdue ? ' overdue' : ''}`}
                    key={task.id}
                  >
                    {editingTask?.id === task.id ? (
                      <div className="task-edit-form">
                        <label>
                          Task title
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(event) => setEditTitle(event.target.value)}
                            maxLength={200}
                            autoFocus
                          />
                        </label>

                        <label>
                          Assigned to
                          <input
                            type="text"
                            value={editAssignee}
                            onChange={(event) => setEditAssignee(event.target.value)}
                            placeholder="Leave blank for unassigned"
                            maxLength={60}
                          />
                        </label>

                        <label>
                          Priority
                          <select
                            value={editPriority}
                            onChange={(event) => setEditPriority(event.target.value)}
                          >
                            <option value="urgent">Urgent</option>
                            <option value="normal">Normal</option>
                            <option value="low">Low</option>
                          </select>
                        </label>

                        <label>
                          Due date
                          <input
                            type="date"
                            value={editDueDate}
                            min={getTodayDate()}
                            onChange={(event) => setEditDueDate(event.target.value)}
                          />
                        </label>

                        <div className="task-edit-actions">
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            disabled={savingEdit}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveEdit}
                            disabled={!editTitle.trim() || savingEdit}
                          >
                            {savingEdit ? 'Saving...' : 'Save changes'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          className={`task-card${overdue ? ' overdue' : ''}`}
                          onClick={() => handleToggleTask(task)}
                          aria-label={`Mark ${task.title} as completed`}
                        >
                          <span className="task-checkbox" />

                          <span className="task-details">
                            <span className="task-title">{task.title}</span>

                            {task.assigned_to && (
                              <span className="task-author">
                                Assigned to {task.assigned_to}
                              </span>
                            )}

                            {(task.created_by || task.createdBy) && (
                              <span className="task-author">
                                Added by {task.created_by || task.createdBy}
                              </span>
                            )}

                            <span className="task-planning-meta">
                              <span className={`task-priority-badge priority-${taskPriority}`}>
                                {taskPriority.charAt(0).toUpperCase() +
                                  taskPriority.slice(1)}
                              </span>

                              {task.due_date ? (
                                <span className={`task-due-date${overdue ? ' overdue' : ''}`}>
                                  {overdue ? 'Overdue · ' : 'Due · '}
                                  {formatDueDate(task.due_date)}
                                </span>
                              ) : (
                                <span className="task-no-due-date">No due date</span>
                              )}
                            </span>
                          </span>
                        </button>

                        <button
                          type="button"
                          className="task-edit-button"
                          onClick={() => handleStartEdit(task)}
                          aria-label={`Edit ${task.title}`}
                        >
                          Edit
                        </button>
                      </>
                    )}
                  </div>
                )

              })
            )}
          </div>

          {filteredOpenTasks.length > visibleOpenCount && (
            <button
              type="button"
              className="completed-toggle"
              onClick={() => setVisibleOpenCount((count) => count + 10)}
            >
              Load 10 more
            </button>
          )}
        </section>

        {completedTasks.length > 0 && (
          <section className="task-section completed-section">
            <div className="task-section-heading">
              <h3>Completed</h3>
              <span>{completedTasks.length}</span>
            </div>

            <div className="completed-task-scroll">
              <div className="task-list">
                {visibleCompletedTasks.map((task) => (
                  <button
                    type="button"
                    className="task-card completed"
                    key={task.id}
                    onClick={() => handleToggleTask(task)}
                    aria-label={`Mark ${task.title} as incomplete`}
                  >
                    <span className="task-checkbox checked">
                      <Icon name="check" size={15} />
                    </span>

                    <span className="task-details">
                      <span className="task-title">{task.title}</span>
                      <span className="task-planning-meta">
                        <span
                          className={`task-priority-badge priority-${task.priority || 'normal'}`}
                        >
                          {(task.priority || 'normal').charAt(0).toUpperCase() +
                            (task.priority || 'normal').slice(1)}
                        </span>

                        {task.due_date && (
                          <span className="task-due-date">
                            Due · {formatDueDate(task.due_date)}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {completedTasks.length > 5 && (
              <button
                type="button"
                className="completed-toggle"
                onClick={() => setShowAllCompleted((current) => !current)}
              >
                {showAllCompleted ? 'Show fewer' : 'View all completed'}
              </button>
            )}
          </section>
        )}
      </main>
    </div>
  )
}

export default Tasks
