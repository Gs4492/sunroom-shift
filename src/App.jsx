import { useEffect, useState } from 'react'
import './App.css'

import Handoff from './Handoff'
import HandoffHistory from './HandoffHistory'
import Tasks from './Tasks'
import { supabase } from './supabaseClient'
import sunroomLogo from './assets/sunroom-plants-logo.png'
import { enablePushNotifications } from './pushNotifications'

function Icon({ name, size = 20, strokeWidth = 1.8 }) {
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
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
      </>
    ),
    menu: (
      <path
        d="M12 5h.01M12 12h.01M12 19h.01"
        strokeWidth="3"
      />
    ),
    notes: (
      <>
        <path d="M8 3h8l4 4v14H4V3h4Z" />
        <path d="M8 3v5h8V3M8 13h8M8 17h5" />
      </>
    ),
    arrowRight: <path d="M5 12h14m-6-6 6 6-6 6" />,
    package: (
      <>
        <path d="m12 3 9 5-9 5-9-5 9-5Z" />
        <path d="M3 8v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="10" cy="7" r="4" />
        <path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    leaf: (
      <>
        <path d="M20 4c-8 0-14 3-14 10a6 6 0 0 0 6 6c7 0 10-8 8-16Z" />
        <path d="M4 21c3-5 7-8 12-11" />
      </>
    ),
    checkSquare: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="m7 12 3 3 7-7" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    microphone: (
      <>
        <rect x="9" y="2" width="6" height="12" rx="3" />
        <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" />
      </>
    ),
    home: (
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z" />
    ),
    tasks: (
      <>
        <path d="M9 6h11M9 12h11M9 18h11" />
        <path d="m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2" />
      </>
    ),
  }

  return <svg {...common}>{paths[name] || paths.notes}</svg>
}

function App() {
  const [screen, setScreen] = useState('home')
  const [historyCategory, setHistoryCategory] = useState('All')
  const [editingHandoff, setEditingHandoff] = useState(null)
  const [successMessage, setSuccessMessage] = useState('')
  const [pushMessage, setPushMessage] = useState('')

  const [notificationsEnabled, setNotificationsEnabled] = useState(
    typeof Notification !== 'undefined' &&
    Notification.permission === 'granted'
  )



  useEffect(() => {
    if (!successMessage) return

    const timeoutId = setTimeout(() => {
      setSuccessMessage('')
    }, 3000)

    return () => clearTimeout(timeoutId)
  }, [successMessage])

  const showSuccessMessage = (message) => {
    setSuccessMessage(message)
  }
  const handleEnableNotifications = async () => {
    try {
      const message = await enablePushNotifications()
      setPushMessage(message)
      setNotificationsEnabled(
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      )
    } catch (error) {
      console.error('Push setup failed:', error)
      setPushMessage(
        error instanceof Error
          ? error.message
          : 'Could not enable notifications.',
      )
    }
  }

  const [handoffs, setHandoffs] = useState([])
  const [handoffsLoading, setHandoffsLoading] = useState(true)

  const [tasks, setTasks] = useState([])
  const [tasksLoading, setTasksLoading] = useState(true)

  useEffect(() => {
    const loadHandoffs = async () => {
      const { data, error } = await supabase
        .from('handoffs')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error loading handoffs:', error.message)
        setHandoffsLoading(false)
        return
      }

      setHandoffs(
        data.map((handoff) => ({
          ...handoff,
          createdAt: handoff.created_at,
          createdBy: handoff.created_by,
        }))
      )

      setHandoffsLoading(false)
    }

    loadHandoffs()
  }, [])

  useEffect(() => {
    const loadTasks = async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error loading tasks:', error.message)
        setTasksLoading(false)
        return
      }

      setTasks(data)
      setTasksLoading(false)
    }

    loadTasks()
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('sunroom-shift-live')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'handoffs',
        },
        async () => {
          const { data, error } = await supabase
            .from('handoffs')
            .select('*')
            .order('created_at', { ascending: false })

          if (error) {
            console.error('Realtime handoff refresh failed:', error.message)
            return
          }

          setHandoffs(
            data.map((handoff) => ({
              ...handoff,
              createdAt: handoff.created_at,
              createdBy: handoff.created_by,
            }))
          )
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
        },
        async () => {
          const { data, error } = await supabase
            .from('tasks')
            .select('*')
            .order('created_at', { ascending: false })

          if (error) {
            console.error('Realtime task refresh failed:', error.message)
            return
          }

          setTasks(data)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])


  const addHandoff = async (newHandoff) => {
    const { data, error } = await supabase
      .from('handoffs')
      .insert({
        category: newHandoff.category,
        note: newHandoff.note,
        created_by: newHandoff.createdBy,
      })
      .select()
      .single()

    if (error) {
      console.error('Error saving handoff:', error.message)
      showSuccessMessage('Could not save handoff. Please try again.')
      return
    }

    const savedHandoff = {
      ...data,
      createdAt: data.created_at,
      createdBy: data.created_by,
    }

    setHandoffs((currentHandoffs) => [
      savedHandoff,
      ...currentHandoffs,
    ])

    setEditingHandoff(null)
    showSuccessMessage('Handoff saved successfully!')
    setScreen('home')
  }

  const updateHandoff = async (updatedHandoff) => {
    const { data, error } = await supabase
      .from('handoffs')
      .update({
        category: updatedHandoff.category,
        note: updatedHandoff.note,
        created_by: updatedHandoff.createdBy,
      })
      .eq('id', updatedHandoff.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating handoff:', error.message)
      showSuccessMessage('Could not update handoff. Please try again.')
      return
    }

    const savedHandoff = {
      ...data,
      createdAt: data.created_at,
      createdBy: data.created_by,
    }

    setHandoffs((currentHandoffs) =>
      currentHandoffs.map((handoff) =>
        handoff.id === savedHandoff.id ? savedHandoff : handoff
      )
    )

    setEditingHandoff(null)
    setHistoryCategory('All')
    showSuccessMessage('Handoff updated successfully!')
    setScreen('history')
  }

  const deleteHandoff = async (handoffId) => {
    const { error } = await supabase
      .from('handoffs')
      .delete()
      .eq('id', handoffId)

    if (error) {
      console.error('Error deleting handoff:', error.message)
      showSuccessMessage('Could not delete handoff. Please try again.')
      return
    }

    setHandoffs((currentHandoffs) =>
      currentHandoffs.filter((handoff) => handoff.id !== handoffId)
    )

    showSuccessMessage('Handoff deleted successfully!')
  }



  const addTask = async (newTask) => {
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        title: newTask.title,
        created_by: newTask.createdBy,
        assigned_to: newTask.assignedTo,
        priority: newTask.priority || 'normal',
        due_date: newTask.dueDate || null,
        completed: false,
      })
      .select()
      .single()

    if (error) {
      console.error('Error saving task:', error.message)
      showSuccessMessage('Could not save task. Please try again.')
      return
    }

    setTasks((currentTasks) => [data, ...currentTasks])
    showSuccessMessage('Task added successfully!')
  }



  const updateTask = async (taskId, updatedTask) => {
    const { data, error } = await supabase
      .from('tasks')
      .update({
        title: updatedTask.title,
        assigned_to: updatedTask.assignedTo,
        priority: updatedTask.priority,
        due_date: updatedTask.dueDate || null,
      })
      .eq('id', taskId)
      .select()
      .single()

    if (error) {
      console.error('Error updating task:', error.message)
      showSuccessMessage('Could not update task. Please try again.')
      return false
    }

    setTasks((currentTasks) =>
      currentTasks.map((task) => (task.id === taskId ? data : task))
    )

    showSuccessMessage('Task updated successfully!')
    return true
  }




  const toggleTask = async (taskId) => {
    const task = tasks.find((item) => item.id === taskId)

    if (!task) return

    const isCompleting = !task.completed

    const { data, error } = await supabase
      .from('tasks')
      .update({
        completed: isCompleting,
        completed_at: isCompleting
          ? new Date().toISOString()
          : null,
      })
      .eq('id', taskId)
      .select()
      .single()

    if (error) {
      console.error('Error updating task:', error.message)
      showSuccessMessage('Could not update task. Please try again.')
      return
    }

    setTasks((currentTasks) =>
      currentTasks.map((item) =>
        item.id === taskId ? data : item
      )
    )
  }


  const openHistory = (category = 'All') => {
    setHistoryCategory(category)
    setScreen('history')
  }

  const startEditingHandoff = (handoff) => {
    setEditingHandoff(handoff)
    setScreen('handoff')
  }

  const openNewHandoff = () => {
    setEditingHandoff(null)
    setScreen('handoff')
  }

  const completedTasks = tasks.filter((task) => task.completed).length
  const openTasks = tasks.length - completedTasks

  const taskProgress =
    tasks.length > 0
      ? Math.round((completedTasks / tasks.length) * 100)
      : 0

  const today = new Date()

  const formattedDate = today.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  const successToast = successMessage ? (
    <div className="save-toast" role="status" aria-live="polite">
      <span className="save-toast-icon" aria-hidden="true">
        <Icon name="check" size={16} />
      </span>
      <span>{successMessage}</span>
    </div>
  ) : null

  const renderScreen = () => {
    if (screen === 'handoff') {
      return (
        <Handoff
          key={editingHandoff?.id ?? 'new-handoff'}
          editingHandoff={editingHandoff}
          onBack={() => {
            setEditingHandoff(null)
            setScreen(editingHandoff ? 'history' : 'home')
          }}
          onSave={editingHandoff ? updateHandoff : addHandoff}
        />
      )
    }

    if (screen === 'history') {
      return (
        <HandoffHistory
          handoffs={handoffs}
          onBack={() => setScreen('home')}
          onDelete={deleteHandoff}
          onEdit={startEditingHandoff}
          initialCategory={historyCategory}
        />
      )
    }

    if (screen === 'tasks') {
      return (
        <Tasks
          tasks={tasks}
          onBack={() => setScreen('home')}
          onAddTask={addTask}
          onToggleTask={toggleTask}
          onUpdateTask={updateTask}
        />
      )
    }

    return (
      <main className="main-content">
        <section className="welcome">
          <img
            src={sunroomLogo}
            alt="Sunroom Plants"
            className="welcome-logo"
          />
          <p className="eyebrow">{formattedDate.toUpperCase()}</p>
          <h1>Welcome to Sunroom Shift</h1>
          <p>Review shift handoffs and track shop tasks.</p>

          <button
            className="notification-button"
            type="button"
            onClick={handleEnableNotifications}
            disabled={notificationsEnabled}
          >
            {notificationsEnabled
              ? '✓ Notifications Enabled'
              : 'Enable Notifications'}
          </button>

          {pushMessage && <p role="status">{pushMessage}</p>}
        </section>

        <section className="handoff-card">
          <div className="card-top">
            <div className="card-icon">
              <Icon name="notes" size={21} />
            </div>

            <span className="card-label">SHIFT HANDOFF</span>
          </div>

          <h2>
            {handoffs.length === 0
              ? 'No shift notes yet'
              : `${handoffs.length} shift notes`}
          </h2>


          <div className="attention-list">
            {handoffs.slice(0, 2).map((handoff) => (
              <div className="attention-item" key={handoff.id}>
                <span className="dot" aria-hidden="true" />

                <div className="attention-content">
                  <div className="attention-meta">
                    <span className="attention-category">
                      {handoff.category || "General"}
                    </span>

                    <span className="attention-time">
                      {handoff.createdAt
                        ? new Date(handoff.createdAt).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })
                        : ""}
                    </span>
                  </div>

                  <span className="attention-note">{handoff.note}</span>
                  {handoff.created_by && (
                    <span className="attention-author">
                      Added by {handoff.created_by}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>


          <button
            className="text-button"
            type="button"
            onClick={() => openHistory('All')}
          >
            View all <Icon name="arrowRight" size={16} />
          </button>
        </section>

        <section className="task-progress-card">
          <div className="task-progress-heading">
            <div>
              <span className="task-progress-eyebrow">
                TODAY'S PROGRESS
              </span>
              <h2>Shop tasks</h2>
            </div>

            <span className="task-progress-percent">
              {taskProgress}%
            </span>
          </div>

          <div
            className="task-progress-track"
            role="progressbar"
            aria-label="Task completion"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={taskProgress}
          >
            <div
              className="task-progress-fill"
              style={{ width: `${taskProgress}%` }}
            />
          </div>

          <div className="task-progress-summary">
            <span>
              <strong>{completedTasks}</strong> completed
            </span>

            <span>
              <strong>{openTasks}</strong> remaining
            </span>
          </div>

          <button
            className="task-progress-link"
            type="button"
            onClick={() => setScreen('tasks')}
          >
            Open task list <Icon name="arrowRight" size={16} />
          </button>
        </section>

        <section className="quick-actions">
          <button
            className="quick-card stock"
            type="button"
            onClick={() => openHistory('Stock')}
          >
            <span className="quick-icon">
              <Icon name="package" size={22} />
            </span>
            <strong>Stock</strong>
            <small>
              {handoffs.filter((handoff) => handoff.category === 'Stock').length}{' '}
              notes
            </small>
          </button>

          <button
            className="quick-card customers"
            type="button"
            onClick={() => openHistory('Customer')}
          >
            <span className="quick-icon">
              <Icon name="users" size={22} />
            </span>
            <strong>Customers</strong>
            <small>
              {handoffs.filter((handoff) => handoff.category === 'Customer').length}{' '}
              notes
            </small>
          </button>

          <button
            className="quick-card plant-care"
            type="button"
            onClick={() => openHistory('Plant Care')}
          >
            <span className="quick-icon">
              <Icon name="leaf" size={22} />
            </span>
            <strong>Plant Care</strong>
            <small>
              {handoffs.filter((handoff) => handoff.category === 'Plant Care').length}{' '}
              notes
            </small>
          </button>

          <button
            className="quick-card tasks"
            type="button"
            onClick={() => setScreen('tasks')}
          >
            <span className="quick-icon">
              <Icon name="checkSquare" size={22} />
            </span>
            <strong>Tasks</strong>
            <small>{openTasks} open</small>
          </button>
        </section>

        <button
          className="add-handoff"
          type="button"
          onClick={openNewHandoff}
        >
          <span className="add-handoff-icon">
            <Icon name="microphone" size={23} />
          </span>

          <div>
            <strong>Add Handoff</strong>
            <small>Tell the next shift what happened</small>
          </div>

          <span className="arrow">
            <Icon name="arrowRight" size={20} />
          </span>
        </button>
      </main>
    )
  }

  const activeNav = screen === 'history' ? 'handoff' : screen

  return (
    <div className="app">
      {renderScreen()}

      <nav className="bottom-nav" aria-label="Main navigation">
        <button
          className={`nav-item ${activeNav === 'home' ? 'active' : ''}`}
          type="button"
          aria-current={activeNav === 'home' ? 'page' : undefined}
          onClick={() => setScreen('home')}
        >
          <Icon name="home" size={21} />
          <span>Home</span>
        </button>

        <button
          className={`nav-item ${activeNav === 'tasks' ? 'active' : ''}`}
          type="button"
          aria-current={activeNav === 'tasks' ? 'page' : undefined}
          onClick={() => setScreen('tasks')}
        >
          <Icon name="tasks" size={21} />
          <span>Tasks</span>
        </button>

        <button
          className={`nav-item ${activeNav === 'handoff' ? 'active' : ''}`}
          type="button"
          aria-current={activeNav === 'handoff' ? 'page' : undefined}
          onClick={openNewHandoff}
        >
          <Icon name="microphone" size={21} />
          <span>Handoff</span>
        </button>
      </nav>

      {successToast}
    </div>
  )
}

export default App
