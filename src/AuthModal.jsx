import { useState } from 'react'
import { useAuth } from './useAuth'

function Icon({ name, size = 18 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }

  const paths = {
    close: (
      <>
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </>
    ),
    lock: (
      <>
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </>
    ),
    user: (
      <>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    alert: (
      <>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </>
    ),
    spinner: <path d="M21 12a9 9 0 1 1-6.219-8.56" />,
    eye: (
      <>
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    eyeOff: (
      <>
        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
        <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
        <line x1="2" y1="2" x2="22" y2="22" />
      </>
    ),
  }

  return <svg {...common}>{paths[name] || paths.lock}</svg>
}

export default function AuthModal({ isOpen, onClose }) {
  const {
    user,
    profile,
    dbConfigured,
    isPasswordRecovery,
    setIsPasswordRecovery,
    login,
    logout,
    resetPassword,
    updatePassword,
  } = useAuth()

  const [mode, setMode] = useState('login') // 'login' | 'reset'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const effectiveMode = isPasswordRecovery ? 'recovery' : mode

  if (!isOpen) return null

  const handleClose = () => {
    setErrorMsg('')
    setSuccessMsg('')
    setUsername('')
    setPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setShowPassword(false)
    setShowNewPassword(false)
    setShowConfirmPassword(false)
    // In normal mode, reset mode to login; during active recovery, do NOT discard recovery session
    setMode('login')
    onClose()
  }

  const handleCancelRecovery = async () => {
    setErrorMsg('')
    setSuccessMsg('')
    setNewPassword('')
    setConfirmPassword('')
    setShowNewPassword(false)
    setShowConfirmPassword(false)
    try {
      await logout()
    } finally {
      setIsPasswordRecovery?.(false)
      setMode('login')
      onClose()
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')

    if (!username.trim() || !password) {
      setErrorMsg('Please enter both your username and password.')
      return
    }

    setLoading(true)

    try {
      const { data, error } = await login(username, password)
      if (error) {
        setErrorMsg(error.message || 'Login failed. Please check your credentials.')
      } else if (data?.user) {
        // Successful login
        handleClose()
      }
    } catch (err) {
      setErrorMsg(err.message || 'An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')

    if (!username.trim()) {
      setErrorMsg('Please enter your username.')
      return
    }

    setLoading(true)
    try {
      const { error } = await resetPassword(username)
      if (error) {
        setErrorMsg(error.message || 'Could not send reset link.')
      } else {
        setSuccessMsg(
          'If this username exists, a password reset link has been sent to the associated email address. Check your inbox to proceed.'
        )
      }
    } catch (err) {
      setErrorMsg(err.message || 'An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdatePassword = async (e) => {
    e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')

    if (newPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.')
      return
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please ensure both fields are identical.')
      return
    }

    setLoading(true)
    try {
      const { error } = await updatePassword(newPassword)
      if (error) {
        setErrorMsg(error.message || 'Could not update password.')
      } else {
        setSuccessMsg(
          'Your password has been successfully updated! You can now use your new password.'
        )
        setNewPassword('')
        setConfirmPassword('')
        setShowNewPassword(false)
        setShowConfirmPassword(false)
        setIsPasswordRecovery?.(false)
        setMode('login')
      }
    } catch (err) {
      setErrorMsg(err.message || 'An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      const { error } = await logout()
      if (error) {
        setErrorMsg(error.message || 'Logout encountered an issue with Supabase.')
      } else {
        handleClose()
      }
    } catch (err) {
      setErrorMsg(err.message || 'Logout failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div
        className="auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
      >
        <div className="auth-modal-header">
          <div className="auth-modal-title-group">
            <span className="auth-modal-icon" aria-hidden="true">
              <Icon name="lock" size={19} />
            </span>
            <div>
              <h2 id="auth-modal-title">
                {effectiveMode === 'recovery'
                  ? 'Set New Password'
                  : user
                  ? 'Private Account'
                  : effectiveMode === 'login'
                  ? 'Private Sign In'
                  : 'Reset Password'}
              </h2>
              <p className="auth-modal-subtitle">
                {effectiveMode === 'recovery'
                  ? 'Choose a new password for your account'
                  : user
                  ? (profile ? `Signed in as ${profile.name}` : 'Signed in')
                  : effectiveMode === 'login'
                  ? 'Access your personal notes and tasks'
                  : 'Enter your username to receive a reset link'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="auth-modal-close"
            onClick={handleClose}
            aria-label="Close dialog"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="auth-modal-body">
          {errorMsg && (
            <div className="auth-alert error" role="alert">
              <Icon name="alert" size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="auth-alert success" role="status">
              <Icon name="check" size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {!dbConfigured && (
            <div className="auth-alert warning" role="alert">
              <Icon name="alert" size={16} />
              <div>
                <strong>Database Configuration Notice:</strong>
                <p>
                  The private authorization allowlist (<code>authorized_private_users</code>) could not be queried or found. Private vault access is restricted until database tables and permissions are accessible.
                </p>
              </div>
            </div>
          )}

          {effectiveMode === 'recovery' ? (
            <form onSubmit={handleUpdatePassword} className="auth-form">
              <div className="form-group">
                <label htmlFor="auth-new-password">New Password</label>
                <div className="auth-input-wrapper">
                  <input
                    id="auth-new-password"
                    type={showNewPassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder="At least 6 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={6}
                    required
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowNewPassword((v) => !v)}
                    tabIndex={-1}
                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                  >
                    <Icon name={showNewPassword ? 'eyeOff' : 'eye'} size={18} />
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="auth-confirm-password">Confirm New Password</label>
                <div className="auth-input-wrapper">
                  <input
                    id="auth-confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder="Re-enter your new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={6}
                    required
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    tabIndex={-1}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    <Icon name={showConfirmPassword ? 'eyeOff' : 'eye'} size={18} />
                  </button>
                </div>
              </div>

              <div className="auth-modal-actions">
                <button
                  type="submit"
                  className="auth-btn auth-btn-primary"
                  disabled={loading}
                >
                  {loading ? (
                    <span className="auth-spinner-wrap">
                      <Icon name="spinner" size={16} /> Updating...
                    </span>
                  ) : (
                    'Save New Password'
                  )}
                </button>
                <button
                  type="button"
                  className="auth-btn auth-btn-secondary"
                  onClick={handleCancelRecovery}
                >
                  Cancel Recovery
                </button>
              </div>
            </form>
          ) : user ? (
            <div className="auth-user-card">
              <div className="auth-user-info">
                <span className="auth-avatar">
                  <Icon name="user" size={24} />
                </span>
                <div>
                  {profile ? (
                    <>
                      <h3 className="auth-user-name">{profile.name}</h3>
                      <span className="auth-badge-authorized">Authorised Private User</span>
                    </>
                  ) : (
                    <>
                      <h3 className="auth-user-name">Private Account</h3>
                      <p className="auth-user-status not-authorized">
                        {dbConfigured
                          ? 'Signed in, but not listed on the Geet / Nikhil / Parul allowlist.'
                          : 'Signed in. Allowlist table pending database setup.'}
                      </p>
                    </>
                  )}
                </div>
              </div>

              <div className="auth-modal-actions">
                <button
                  type="button"
                  className="auth-btn auth-btn-danger"
                  onClick={handleLogout}
                  disabled={loading}
                >
                  {loading ? 'Logging out...' : 'Log Out'}
                </button>
                <button
                  type="button"
                  className="auth-btn auth-btn-secondary"
                  onClick={handleClose}
                >
                  Close
                </button>
              </div>
            </div>
          ) : effectiveMode === 'login' ? (
            <form onSubmit={handleLogin} className="auth-form">
              <div className="auth-team-badge">
                <Icon name="user" size={15} />
                <span>Private space for <strong>Parul</strong>, and <strong>Nikhil</strong></span>
              </div>

              <div className="form-group">
                <label htmlFor="auth-username">Username</label>
                <input
                  id="auth-username"
                  type="text"
                  className="form-input"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>

              <div className="form-group">
                <div className="form-label-row">
                  <label htmlFor="auth-password">Password</label>
                  <button
                    type="button"
                    className="auth-link-btn"
                    onClick={() => {
                      setErrorMsg('')
                      setSuccessMsg('')
                      setMode('reset')
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="auth-input-wrapper">
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <Icon name={showPassword ? 'eyeOff' : 'eye'} size={18} />
                  </button>
                </div>
              </div>

              <div className="auth-modal-actions">
                <button
                  type="submit"
                  className="auth-btn auth-btn-primary"
                  disabled={loading}
                >
                  {loading ? (
                    <span className="auth-spinner-wrap">
                      <Icon name="spinner" size={16} /> Signing in...
                    </span>
                  ) : (
                    'Sign In'
                  )}
                </button>
                <button
                  type="button"
                  className="auth-btn auth-btn-secondary"
                  onClick={handleClose}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleResetPassword} className="auth-form">
              <div className="auth-team-badge">
                <Icon name="user" size={15} />
                <span>Password recovery for authorized team accounts</span>
              </div>

              <div className="form-group">
                <label htmlFor="reset-username">Username</label>
                <input
                  id="reset-username"
                  type="text"
                  className="form-input"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>

              <div className="auth-modal-actions">
                <button
                  type="submit"
                  className="auth-btn auth-btn-primary"
                  disabled={loading}
                >
                  {loading ? (
                    <span className="auth-spinner-wrap">
                      <Icon name="spinner" size={16} /> Sending...
                    </span>
                  ) : (
                    'Send Reset Link'
                  )}
                </button>
                <button
                  type="button"
                  className="auth-link-btn center"
                  onClick={() => {
                    setErrorMsg('')
                    setSuccessMsg('')
                    setMode('login')
                  }}
                >
                  Back to Sign In
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
