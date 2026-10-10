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

function Tasks({ tasks, onBack, onAddTask, onToggleTask }) {
  const [newTask, setNewTask] = useState('')

  const handleAddTask = () => {
    if (!newTask.trim()) {
      return
    }

    onAddTask(newTask.trim())
    setNewTask('')
  }

  const openTasks = tasks.filter(
    (task) => !task.completed
  )

  const completedTasks = tasks.filter(
    (task) => task.completed
  )

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
          <span className="screen-eyebrow">
            SHIFT TASKS
          </span>

          <h1>Tasks</h1>
        </div>
      </header>

      <main className="tasks-content">
        <section className="tasks-intro">
          <h2>What needs to get done?</h2>

          <p>
            Keep track of tasks for the shop and the next shift.
          </p>
        </section>

        <section className="add-task-section">
          <input
            type="text"
            value={newTask}
            onChange={(event) => setNewTask(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                handleAddTask()
              }
            }}
            placeholder="Add a task..."
            aria-label="New task"
          />

          <button
            type="button"
            onClick={handleAddTask}
            disabled={!newTask.trim()}
          >
            Add
          </button>
        </section>

        <section className="task-section">
          <div className="task-section-heading">
            <h3>Open Tasks</h3>

            <span>{openTasks.length}</span>
          </div>

          <div className="task-list">
            {openTasks.length === 0 ? (
              <div className="empty-tasks">
                <div className="empty-task-icon">
                  <Icon name="check" size={22} />
                </div>

                <p>Nothing needs to be done right now.</p>
              </div>
            ) : (
              openTasks.map((task) => (
                <button
                  type="button"
                  className="task-card"
                  key={task.id}
                  onClick={() => onToggleTask(task.id)}
                  aria-label={`Mark ${task.title} as completed`}
                >
                  <span className="task-checkbox" />

                  <span className="task-title">
                    {task.title}
                  </span>
                </button>
              ))
            )}
          </div>
        </section>

        {completedTasks.length > 0 && (
          <section className="task-section completed-section">
            <div className="task-section-heading">
              <h3>Completed</h3>

              <span>{completedTasks.length}</span>
            </div>

            <div className="task-list">
              {completedTasks.map((task) => (
                <button
                  type="button"
                  className="task-card completed"
                  key={task.id}
                  onClick={() => onToggleTask(task.id)}
                  aria-label={`Mark ${task.title} as incomplete`}
                >
                  <span className="task-checkbox checked">
                    <Icon name="check" size={15} />
                  </span>

                  <span className="task-title">
                    {task.title}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default Tasks
