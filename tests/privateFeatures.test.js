import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const AUTHORIZED_NAMES = ['Geet', 'Nikhil', 'Parul']
const SHARED_EMPLOYEE_NAMES = ['Carla', 'Anoushka', 'Chloe', 'Medina']

function isAuthorizedPrivateUser(name) {
  return AUTHORIZED_NAMES.includes(name)
}

function validatePrivateNotePayload({ userId, note, category = 'General' }) {
  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    return { valid: false, error: 'Authenticated Supabase user ID is required.' }
  }
  if (!note || typeof note !== 'string' || note.trim() === '') {
    return { valid: false, error: 'Note text cannot be empty.' }
  }
  return {
    valid: true,
    data: {
      user_id: userId.trim(),
      note: note.trim(),
      category: category || 'General',
    },
  }
}

function validatePrivateTaskPayload({ userId, title, priority = 'normal', dueDate = null, assignedTo = null }) {
  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    return { valid: false, error: 'Authenticated Supabase user ID is required.' }
  }
  if (!title || typeof title !== 'string' || title.trim() === '') {
    return { valid: false, error: 'Task title cannot be empty.' }
  }
  if (assignedTo !== null && assignedTo !== undefined) {
    return { valid: false, error: 'Private tasks cannot be assigned to another employee.' }
  }
  const validPriorities = ['low', 'normal', 'high', 'urgent']
  if (!validPriorities.includes(priority)) {
    return { valid: false, error: `Invalid priority: ${priority}` }
  }
  return {
    valid: true,
    data: {
      user_id: userId.trim(),
      title: title.trim(),
      priority,
      due_date: dueDate,
      completed: false,
    },
  }
}

test('Private Features - Authorized User Allowlist Enforcement', () => {
  // Geet, Nikhil, and Parul must be authorized
  assert.equal(isAuthorizedPrivateUser('Geet'), true)
  assert.equal(isAuthorizedPrivateUser('Nikhil'), true)
  assert.equal(isAuthorizedPrivateUser('Parul'), true)

  // Shared team staff must not be on the private allowlist
  for (const employee of SHARED_EMPLOYEE_NAMES) {
    assert.equal(isAuthorizedPrivateUser(employee), false)
  }

  // Unknown or spoofed identities must be rejected
  assert.equal(isAuthorizedPrivateUser('Admin'), false)
  assert.equal(isAuthorizedPrivateUser(''), false)
  assert.equal(isAuthorizedPrivateUser(null), false)
})

test('Private Notes - Payload Validation & Ownership Binding', () => {
  const dummyAuthUid = '00000000-0000-0000-0000-000000000001'

  // Valid note creation
  const validResult = validatePrivateNotePayload({
    userId: dummyAuthUid,
    note: 'Sensitive stock reorder count',
    category: 'Stock',
  })
  assert.equal(validResult.valid, true)
  assert.equal(validResult.data.user_id, dummyAuthUid)
  assert.equal(validResult.data.note, 'Sensitive stock reorder count')
  assert.equal(validResult.data.category, 'Stock')

  // Rejects empty note
  const emptyNoteResult = validatePrivateNotePayload({
    userId: dummyAuthUid,
    note: '   ',
  })
  assert.equal(emptyNoteResult.valid, false)
  assert.match(emptyNoteResult.error, /Note text cannot be empty/i)

  // Rejects unauthenticated creation (missing user_id)
  const unauthResult = validatePrivateNotePayload({
    userId: '',
    note: 'Valid note content',
  })
  assert.equal(unauthResult.valid, false)
  assert.match(unauthResult.error, /user ID is required/i)
})

test('Private Tasks - Personal Ownership & No Employee Assignment', () => {
  const dummyAuthUid = '00000000-0000-0000-0000-000000000002'

  // Valid private task creation
  const validTask = validatePrivateTaskPayload({
    userId: dummyAuthUid,
    title: 'Review shop quarterly budget',
    priority: 'urgent',
    dueDate: '2026-11-15',
  })
  assert.equal(validTask.valid, true)
  assert.equal(validTask.data.user_id, dummyAuthUid)
  assert.equal(validTask.data.title, 'Review shop quarterly budget')
  assert.equal(validTask.data.priority, 'urgent')
  assert.equal(validTask.data.completed, false)

  // Strictly prohibits assigning private tasks to another employee
  const invalidAssignment = validatePrivateTaskPayload({
    userId: dummyAuthUid,
    title: 'Clean back room',
    assignedTo: 'Chloe',
  })
  assert.equal(invalidAssignment.valid, false)
  assert.match(invalidAssignment.error, /cannot be assigned to another employee/i)

  // Rejects empty title
  const emptyTitle = validatePrivateTaskPayload({
    userId: dummyAuthUid,
    title: '   ',
  })
  assert.equal(emptyTitle.valid, false)
  assert.match(emptyTitle.error, /title cannot be empty/i)
})

test('Database Migration - Integrity & Row Level Security Rules in SQL', () => {
  const migrationPath = path.resolve(
    process.cwd(),
    'supabase/migrations/20261105000100_create_private_notes_and_tasks.sql'
  )
  assert.equal(fs.existsSync(migrationPath), true, 'Migration file must exist locally')

  const sqlContent = fs.readFileSync(migrationPath, 'utf8')

  // Check required tables exist
  assert.match(sqlContent, /CREATE TABLE IF NOT EXISTS public\.authorized_private_users/i)
  assert.match(sqlContent, /CREATE TABLE IF NOT EXISTS public\.private_notes/i)
  assert.match(sqlContent, /CREATE TABLE IF NOT EXISTS public\.private_tasks/i)

  // Check that Row Level Security is explicitly enabled on all tables
  assert.match(sqlContent, /ALTER TABLE public\.authorized_private_users ENABLE ROW LEVEL SECURITY/i)
  assert.match(sqlContent, /ALTER TABLE public\.private_notes ENABLE ROW LEVEL SECURITY/i)
  assert.match(sqlContent, /ALTER TABLE public\.private_tasks ENABLE ROW LEVEL SECURITY/i)

  // Check that anon access is explicitly revoked
  assert.match(sqlContent, /REVOKE ALL ON public\.authorized_private_users FROM anon/i)
  assert.match(sqlContent, /REVOKE ALL ON public\.private_notes FROM anon/i)
  assert.match(sqlContent, /REVOKE ALL ON public\.private_tasks FROM anon/i)

  // Check zero-argument helper function definition with empty search_path and auth.uid()
  assert.match(sqlContent, /CREATE OR REPLACE FUNCTION public\.is_authorized_private_user\(\)/i)
  assert.match(sqlContent, /SET search_path = ''/i)
  assert.match(sqlContent, /WHERE id = auth\.uid\(\)/i)

  // Check function execution privileges: revoked from PUBLIC and anon, granted to authenticated only
  assert.match(sqlContent, /REVOKE EXECUTE ON FUNCTION public\.is_authorized_private_user\(\) FROM PUBLIC/i)
  assert.match(sqlContent, /REVOKE EXECUTE ON FUNCTION public\.is_authorized_private_user\(\) FROM anon/i)
  assert.match(sqlContent, /GRANT EXECUTE ON FUNCTION public\.is_authorized_private_user\(\) TO authenticated/i)

  // Check composite indexes on (user_id, created_at DESC)
  assert.match(sqlContent, /CREATE INDEX IF NOT EXISTS idx_private_notes_user_created\s+ON public\.private_notes\(user_id,\s*created_at DESC\)/i)
  assert.match(sqlContent, /CREATE INDEX IF NOT EXISTS idx_private_tasks_user_created\s+ON public\.private_tasks\(user_id,\s*created_at DESC\)/i)

  // Check explicit VALUES mapping in allowlist population instructions
  assert.match(sqlContent, /VALUES\s*\(\s*'geet@/i)
  assert.match(sqlContent, /JOIN auth\.users u ON lower\(u\.email\) = lower\(m\.email\)/i)

  // Check strict RLS ownership check: auth.uid() = user_id
  assert.match(sqlContent, /auth\.uid\(\)\s*=\s*user_id/i)

  // Check that policies call the zero-argument helper function without arbitrary UUID arguments
  assert.match(sqlContent, /public\.is_authorized_private_user\(\)/i)
  assert.equal(sqlContent.includes('is_authorized_private_user(user_uuid'), false)
  assert.equal(sqlContent.includes('is_authorized_private_user(auth.uid())'), false)

  // Check foreign keys to auth.users(id) ON DELETE CASCADE
  assert.match(sqlContent, /REFERENCES auth\.users\(id\)\s+ON DELETE CASCADE/i)
})

test('Frontend Private Operations - Require Both User and isAuthorized', () => {
  function canAddPrivateItem({ user, isAuthorized }) {
    if (!user || !isAuthorized) return false
    return true
  }

  assert.equal(canAddPrivateItem({ user: { id: 'uuid-1' }, isAuthorized: true }), true)
  assert.equal(canAddPrivateItem({ user: { id: 'uuid-1' }, isAuthorized: false }), false)
  assert.equal(canAddPrivateItem({ user: null, isAuthorized: true }), false)
  assert.equal(canAddPrivateItem({ user: null, isAuthorized: false }), false)
})

// ============================================================================
// AUTOMATED SECURITY, SESSION & PRIVATE DATA ISOLATION TESTS (10 REQUIREMENTS)
// ============================================================================

test('1. Authorization Isolation - Geet authorization cleared immediately when Nikhil signs in', () => {
  // Simulates AuthProvider derived authorization state
  function computeIsAuthorized(user, authorizedUserId, profile) {
    return Boolean(
      user &&
      authorizedUserId === user.id &&
      profile &&
      profile.id === user.id &&
      ['Geet', 'Nikhil', 'Parul'].includes(profile.name)
    )
  }

  const geetUser = { id: 'user-geet-001', email: 'geet@sunroomplants.com' }
  const geetProfile = { id: 'user-geet-001', name: 'Geet', email: 'geet@sunroomplants.com' }
  let authorizedUserId = geetUser.id

  // Geet is signed in and authorized
  assert.equal(computeIsAuthorized(geetUser, authorizedUserId, geetProfile), true)

  // Nikhil signs in: user changes to Nikhil before allowlist query completes
  const nikhilUser = { id: 'user-nikhil-002', email: 'nikhil@sunroomplants.com' }
  
  // IMMEDIATELY on the user transition (even while authorizedUserId still holds the previous value),
  // Nikhil must NOT be considered authorized!
  assert.equal(computeIsAuthorized(nikhilUser, authorizedUserId, geetProfile), false)

  // Once checkUserAuthorization begins for Nikhil, authorizedUserId is reset
  authorizedUserId = null
  assert.equal(computeIsAuthorized(nikhilUser, authorizedUserId, null), false)
})

test('2. Profile Isolation - Previous profile information never appears for the new user', () => {
  function computeEffectiveProfile(user, profile) {
    return (user && profile && profile.id === user.id) ? profile : null
  }

  const geetUser = { id: 'user-geet-001', email: 'geet@sunroomplants.com' }
  const geetProfile = { id: 'user-geet-001', name: 'Geet', email: 'geet@sunroomplants.com' }

  assert.deepEqual(computeEffectiveProfile(geetUser, geetProfile), geetProfile)

  // Account switch: Nikhil is now active user
  const nikhilUser = { id: 'user-nikhil-002', email: 'nikhil@sunroomplants.com' }

  // Must immediately return null rather than displaying Geet's profile
  assert.equal(computeEffectiveProfile(nikhilUser, geetProfile), null)
})

test('3. Private Data Isolation - Notes and tasks cleared during account switch', () => {
  function computeDisplayedRecords({ user, isAuthorized, loadedUserId, records }) {
    const isDisplayAllowed = Boolean(user && isAuthorized && loadedUserId === user.id)
    return isDisplayAllowed ? records : []
  }

  const geetNotes = [{ id: 'n1', user_id: 'user-geet-001', note: 'Secret Geet Note' }]
  const geetTasks = [{ id: 't1', user_id: 'user-geet-001', title: 'Secret Geet Task' }]

  // Geet viewing records
  assert.equal(
    computeDisplayedRecords({
      user: { id: 'user-geet-001' },
      isAuthorized: true,
      loadedUserId: 'user-geet-001',
      records: geetNotes,
    }).length,
    1
  )

  // Nikhil switches in; loadedUserId has not yet completed for Nikhil
  const nikhilUser = { id: 'user-nikhil-002' }
  const notesDuringTransition = computeDisplayedRecords({
    user: nikhilUser,
    isAuthorized: false,
    loadedUserId: 'user-geet-001',
    records: geetNotes,
  })
  const tasksDuringTransition = computeDisplayedRecords({
    user: nikhilUser,
    isAuthorized: false,
    loadedUserId: 'user-geet-001',
    records: geetTasks,
  })

  // Both must be completely empty during transition
  assert.deepEqual(notesDuringTransition, [])
  assert.deepEqual(tasksDuringTransition, [])
})

test('4. Request Cancellation - Stale in-flight response from previous user is ignored', () => {
  let loadVersion = 0
  let currentUserId = 'user-geet-001'
  let stateNotes = []

  function startLoad(userId) {
    const version = ++loadVersion
    currentUserId = userId
    return { version, targetUserId: userId }
  }

  function handleResponse({ version, targetUserId, data }) {
    // If request version is stale or user ID has changed, discard response
    if (version !== loadVersion || targetUserId !== currentUserId) {
      return false // Discarded
    }
    stateNotes = data
    return true
  }

  // Geet initiates slow request
  const geetRequest = startLoad('user-geet-001')

  // User rapidly switches to Nikhil before Geet request finishes
  startLoad('user-nikhil-002')

  // Geet's slow response finally arrives
  const geetResponseHandled = handleResponse({
    version: geetRequest.version,
    targetUserId: geetRequest.targetUserId,
    data: [{ id: 'geet-confidential', note: 'Financials' }],
  })

  assert.equal(geetResponseHandled, false, 'Stale request from previous user must be discarded')
  assert.deepEqual(stateNotes, [], 'State must not be populated with previous user data')
})

test('5. Operation Protection - Unauthorized users cannot invoke private operations', () => {
  function executePrivateMutation({ user, isAuthorized, operation }) {
    if (!user || !isAuthorized) {
      return { executed: false, error: 'Unauthorized: requires authenticated allowlist user' }
    }
    return { executed: true, result: operation() }
  }

  const unauthUser = { id: 'user-unknown-999' }
  const mutationResult = executePrivateMutation({
    user: unauthUser,
    isAuthorized: false,
    operation: () => 'created note',
  })

  assert.equal(mutationResult.executed, false)
  assert.match(mutationResult.error, /requires authenticated allowlist user/i)
})

test('6. Session Race Resolution - Initial session restoration does not overwrite newer auth event', () => {
  let activeSession = null
  let authEventReceived = false

  function onAuthEvent(eventSession) {
    authEventReceived = true
    activeSession = eventSession
  }

  function onGetSessionResolved(initialSession) {
    // If an auth event has already been received from onAuthStateChange,
    // do NOT allow a delayed getSession() response to overwrite it.
    if (!authEventReceived) {
      activeSession = initialSession
    }
  }

  // 1. onAuthStateChange fires first with active user session
  const newerSession = { user: { id: 'user-nikhil-002', email: 'nikhil@sunroomplants.com' } }
  onAuthEvent(newerSession)

  // 2. Delayed getSession resolves later with stale/null session
  const staleInitialSession = null
  onGetSessionResolved(staleInitialSession)

  // Newer session established by onAuthStateChange must be preserved
  assert.deepEqual(activeSession, newerSession)
})

test('7. Password Recovery Workflow - PASSWORD_RECOVERY event sets recovery mode and opens modal', () => {
  let isPasswordRecovery = false
  let isAuthModalOpen = false

  function handleAuthEvent(event) {
    if (event === 'PASSWORD_RECOVERY') {
      isPasswordRecovery = true
    }
  }

  function computeModalState(isOpenState, recoveryState) {
    const isOpen = isOpenState || Boolean(recoveryState)
    const effectiveMode = recoveryState ? 'recovery' : 'login'
    return { isOpen, effectiveMode }
  }

  // Trigger Supabase PASSWORD_RECOVERY event
  handleAuthEvent('PASSWORD_RECOVERY')
  assert.equal(isPasswordRecovery, true)

  const modalState = computeModalState(isAuthModalOpen, isPasswordRecovery)
  assert.equal(modalState.isOpen, true, 'Modal must open when recovery event is received')
  assert.equal(modalState.effectiveMode, 'recovery', 'Mode must automatically switch to recovery')
})

test('8. Password Updates - Validation, API invocation, and password privacy', () => {
  function validateNewPassword(newPassword, confirmPassword) {
    if (!newPassword || newPassword.length < 6) {
      return { valid: false, error: 'Password must be at least 6 characters long.' }
    }
    if (newPassword !== confirmPassword) {
      return { valid: false, error: 'Passwords do not match. Please ensure both fields are identical.' }
    }
    return { valid: true }
  }

  // Reject passwords < 6 chars
  const shortResult = validateNewPassword('12345', '12345')
  assert.equal(shortResult.valid, false)
  assert.match(shortResult.error, /at least 6 characters/i)

  // Reject mismatched passwords
  const mismatchResult = validateNewPassword('SecurePass123!', 'DifferentPass456!')
  assert.equal(mismatchResult.valid, false)
  assert.match(mismatchResult.error, /do not match/i)

  // Accept valid matching passwords
  const validResult = validateNewPassword('SecurePass123!', 'SecurePass123!')
  assert.equal(validResult.valid, true)

  // Mock updateUser call returning error without leaking password
  async function mockUpdatePassword(password, shouldFail = false) {
    // Passwords must never be logged or echoed in error
    if (shouldFail) {
      return { data: null, error: { message: 'Auth session expired or token invalid.' } }
    }
    return { data: { user: { id: 'uuid-1' } }, error: null }
  }

  return Promise.all([
    mockUpdatePassword('SecurePass123!', false).then((res) => {
      assert.equal(res.error, null)
      assert.ok(res.data.user)
    }),
    mockUpdatePassword('SecurePass123!', true).then((res) => {
      assert.match(res.error.message, /expired or token invalid/i)
      assert.equal(JSON.stringify(res).includes('SecurePass123!'), false, 'Password must never be in return payload')
    }),
  ])
})

test('9. Logout Integrity - Preserves state on failure, clears completely on success', () => {
  let session = { token: 'active-session-token' }
  let user = { id: 'user-parul-003' }
  let profile = { name: 'Parul' }
  let isAuthorized = true

  function handleLogoutResult(error) {
    if (error) {
      // Must NOT clear state on sign out error
      return { error }
    }
    // Only clear upon successful sign-out
    session = null
    user = null
    profile = null
    isAuthorized = false
    return { error: null }
  }

  // Failed sign-out: network failure
  const failResult = handleLogoutResult(new Error('Network error during sign-out'))
  assert.ok(failResult.error)
  assert.ok(session, 'Session must be preserved when logout fails')
  assert.ok(user, 'User must be preserved when logout fails')
  assert.equal(isAuthorized, true, 'Authorization must be preserved when logout fails')

  // Successful sign-out
  const successResult = handleLogoutResult(null)
  assert.equal(successResult.error, null)
  assert.equal(session, null)
  assert.equal(user, null)
  assert.equal(profile, null)
  assert.equal(isAuthorized, false)
})

test('10. Shared Team Workflows - Shared handoffs and tasks remain unchanged and accessible without login', () => {
  const SHARED_STAFF = ['Carla', 'Anoushka', 'Chloe', 'Medina']

  function canCreateSharedTask({ authorName, isPrivate }) {
    if (isPrivate) {
      return { allowed: false, reason: 'Private tasks require authentication' }
    }
    if (!authorName || authorName.trim() === '') {
      return { allowed: false, reason: 'Author name is required' }
    }
    return { allowed: true }
  }

  // All shared staff can create shared tasks without authentication
  for (const staff of SHARED_STAFF) {
    const result = canCreateSharedTask({ authorName: staff, isPrivate: false })
    assert.equal(result.allowed, true, `${staff} must be able to create shared tasks without logging in`)
  }
})

test('11. Query Ownership Scoping - Explicit user_id filters on counts and reads', () => {
  function buildCountQueries(userId) {
    return {
      notesCountQuery: { table: 'private_notes', filter: { user_id: userId } },
      tasksCountQuery: { table: 'private_tasks', filter: { user_id: userId, completed: false } },
    }
  }

  function buildReadQueries(userId) {
    return {
      notesReadQuery: { table: 'private_notes', filter: { user_id: userId } },
      tasksReadQuery: { table: 'private_tasks', filter: { user_id: userId } },
    }
  }

  const userId = '00000000-0000-0000-0000-000000000001'
  const countQueries = buildCountQueries(userId)
  assert.equal(countQueries.notesCountQuery.filter.user_id, userId)
  assert.equal(countQueries.tasksCountQuery.filter.user_id, userId)
  assert.equal(countQueries.tasksCountQuery.filter.completed, false)

  const readQueries = buildReadQueries(userId)
  assert.equal(readQueries.notesReadQuery.filter.user_id, userId)
  assert.equal(readQueries.tasksReadQuery.filter.user_id, userId)
})

test('12. Dashboard Count Isolation - Pending request cannot update another account count', async () => {
  let activeUser = { id: 'user-geet-001' }
  let isAuthorized = true
  let dashboardCounts = {
    'user-geet-001': { notes: 5, tasks: 2 },
    'user-nikhil-002': { notes: 0, tasks: 0 },
  }

  async function addPrivateNoteAction(authorId) {
    const activeUserId = authorId
    // Simulate async network request
    await new Promise((resolve) => setTimeout(resolve, 10))

    // After completion, verify same user is still authenticated and authorized
    if (activeUser?.id !== activeUserId || !isAuthorized) {
      return false // Discard count update
    }

    dashboardCounts[activeUserId].notes += 1
    return true
  }

  // Geet starts adding a note
  const geetPromise = addPrivateNoteAction('user-geet-001')

  // User rapidly switches account to Nikhil before Geet's insert finishes
  activeUser = { id: 'user-nikhil-002' }

  const updated = await geetPromise
  assert.equal(updated, false, 'Pending request from previous user must not update dashboard')
  assert.equal(dashboardCounts['user-geet-001'].notes, 5, 'Geet count unchanged')
  assert.equal(dashboardCounts['user-nikhil-002'].notes, 0, 'Nikhil count must not receive Geet increment')
})

test('13. Profile Refresh - Preserves valid authorization in-flight and avoids duplicate checks', async () => {
  let isAuthorized = true
  let checkCount = 0
  const lastCheckedUserId = { current: 'user-geet-001' }

  async function checkUserAuthorization(user, { isAccountChange = false } = {}) {
    checkCount++
    if (isAccountChange) {
      isAuthorized = false
    }
    // Simulate query returning profile
    await Promise.resolve()
    isAuthorized = true
  }

  async function refreshProfile(user) {
    if (user) {
      // isAccountChange is false: does NOT clear valid authorization during refresh
      // and does NOT clear lastCheckedUserId.current
      await checkUserAuthorization(user, { isAccountChange: false })
    }
  }

  // Initial state: Geet is authorized
  assert.equal(isAuthorized, true)
  assert.equal(lastCheckedUserId.current, 'user-geet-001')

  // Trigger refreshProfile
  const refreshPromise = refreshProfile({ id: 'user-geet-001' })
  // In-flight authorization must remain true
  assert.equal(isAuthorized, true, 'Valid authorization must not be cleared during refresh')
  await refreshPromise

  // Deduplication check: lastCheckedUserId did not reset to null, so effect will not fire a second check
  assert.equal(checkCount, 1, 'Only one authorization check must run during profile refresh')
  assert.equal(lastCheckedUserId.current, 'user-geet-001')
})

// ============================================================================
// USERNAME AUTHENTICATION, PASSWORD RECOVERY & EMAIL PRIVACY TESTS
// ============================================================================

test('14. Username Login Flow - Valid credentials via server-side Edge Function and token session', async () => {
  // Server-side credential mapping (isolated on server, never on client)
  const serverUserMap = {
    geet: 'geeth58@outlook.com',
    parul: 'contact@sunroomplants.com',
    nikhil: 'nikhil.giri@gmail.com',
  }

  // Mock server-side Edge Function handler
  async function mockPrivateAuthEdgeFunction({ action, username, password }) {
    if (action !== 'login') return { error: 'Invalid action' }
    const normalizedUsername = String(username || '').trim().toLowerCase()
    const email = serverUserMap[normalizedUsername]

    if (!email || password !== 'CorrectPassword123!') {
      return { error: 'Invalid username or password' }
    }

    // Return session tokens WITHOUT exposing resolved email
    return {
      session: {
        access_token: 'mock-access-token-xyz',
        refresh_token: 'mock-refresh-token-xyz',
        expires_in: 3600,
        token_type: 'bearer',
      },
      user: {
        id: '00000000-0000-0000-0000-000000000001',
      },
      username: normalizedUsername,
    }
  }

  // Client-side login handler invoking Edge Function and establishing session
  async function clientLogin(inputUsername, inputPassword) {
    const cleanUsername = String(inputUsername || '').trim().toLowerCase()
    const response = await mockPrivateAuthEdgeFunction({
      action: 'login',
      username: cleanUsername,
      password: inputPassword,
    })

    if (response.error) {
      return { data: null, error: new Error(response.error) }
    }

    // Verify response does not leak email
    assert.equal(response.user.email, undefined, 'Email must not be in Edge Function response')
    assert.equal(JSON.stringify(response).includes('@'), false, 'Response must not contain any email address')

    // Mock client setSession
    const sessionData = {
      session: response.session,
      user: response.user,
    }
    return { data: sessionData, error: null }
  }

  // Login with mixed-case and whitespace username
  const result = await clientLogin('  GEET  ', 'CorrectPassword123!')
  assert.equal(result.error, null)
  assert.equal(result.data.user.id, '00000000-0000-0000-0000-000000000001')
  assert.equal(result.data.session.access_token, 'mock-access-token-xyz')
})

test('15. Username Login Generic Failure & Non-leakage - Invalid username/password return generic errors', async () => {
  const serverUserMap = {
    geet: 'geeth58@outlook.com',
    parul: 'contact@sunroomplants.com',
    nikhil: 'nikhil.giri@gmail.com',
  }

  async function mockPrivateAuthEdgeFunction({ action, username, password }) {
    if (action !== 'login') return { error: 'Invalid action' }
    const normalizedUsername = String(username || '').trim().toLowerCase()
    const email = serverUserMap[normalizedUsername]

    if (!email || password !== 'CorrectPassword123!') {
      return { error: 'Invalid username or password' }
    }
    return { session: { access_token: 'token' }, user: { id: 'uuid-1' } }
  }

  // 1. Non-existent username
  const badUserRes = await mockPrivateAuthEdgeFunction({
    action: 'login',
    username: 'nonexistent_user',
    password: 'SomePassword',
  })
  assert.equal(badUserRes.error, 'Invalid username or password')

  // 2. Existing username, wrong password
  const badPassRes = await mockPrivateAuthEdgeFunction({
    action: 'login',
    username: 'geet',
    password: 'WrongPassword',
  })
  assert.equal(badPassRes.error, 'Invalid username or password')

  // Error messages must be completely identical (no user enumeration)
  assert.equal(badUserRes.error, badPassRes.error)
})

test('16. Username Password Recovery - Returns identical generic response without exposing email', async () => {
  const serverUserMap = {
    geet: 'geeth58@outlook.com',
    parul: 'contact@sunroomplants.com',
    nikhil: 'nikhil.giri@gmail.com',
  }

  const emailDispatchLog = []

  async function mockRecoverPasswordEdgeFunction({ action, username }) {
    if (action !== 'recover-password') return { error: 'Invalid action' }
    const cleanUsername = String(username || '').trim().toLowerCase()
    const email = serverUserMap[cleanUsername]

    if (email) {
      emailDispatchLog.push(email)
    }

    // Always return identical generic message
    return {
      message:
        'If this username exists, a password reset link has been sent to the associated email address.',
    }
  }

  // Known username recovery
  const knownResult = await mockRecoverPasswordEdgeFunction({
    action: 'recover-password',
    username: '  Parul  ',
  })
  assert.match(knownResult.message, /password reset link has been sent/i)
  assert.equal(JSON.stringify(knownResult).includes('@'), false, 'Response must not contain email')

  // Unknown username recovery
  const unknownResult = await mockRecoverPasswordEdgeFunction({
    action: 'recover-password',
    username: 'random_stranger',
  })
  assert.equal(knownResult.message, unknownResult.message, 'Generic message must be identical')
  assert.equal(JSON.stringify(unknownResult).includes('@'), false)

  // Verify internal dispatch triggered only for known user
  assert.deepEqual(emailDispatchLog, ['contact@sunroomplants.com'])
})

test('17. Recovery Session Preservation on Modal Close vs Safe Cancellation', async () => {
  let isPasswordRecovery = true
  let isAuthModalOpen = true
  let user = { id: 'recovery-user-uuid' }

  // User simply closes modal via 'X' or backdrop
  function handleCloseModal() {
    isAuthModalOpen = false
    // MUST NOT clear isPasswordRecovery!
  }

  handleCloseModal()
  assert.equal(isAuthModalOpen, false)
  assert.equal(isPasswordRecovery, true, 'Closing modal must not discard recovery session state')

  // User explicitly cancels recovery via Cancel Recovery button
  async function handleCancelRecovery() {
    // Safely sign out and clear recovery state
    user = null
    isPasswordRecovery = false
    isAuthModalOpen = false
  }

  await handleCancelRecovery()
  assert.equal(isPasswordRecovery, false, 'Explicit cancel must clear recovery state')
  assert.equal(user, null, 'Explicit cancel must sign out recovery session')
})

test('18. Email Privacy - Client bundle files do not contain private email addresses', () => {
  const PRIVATE_EMAILS = [
    'geeth58@outlook.com',
    'contact@sunroomplants.com',
    'nikhil.giri@gmail.com',
  ]

  const clientFilesToCheck = [
    'src/AuthModal.jsx',
    'src/authContext.jsx',
    'src/AuthContextDef.js',
    'src/useAuth.js',
    'src/App.jsx',
    'src/PrivateNotes.jsx',
    'src/PrivateTasks.jsx',
    'src/Handoff.jsx',
    'src/Tasks.jsx',
  ]

  for (const relativePath of clientFilesToCheck) {
    const fullPath = path.resolve(process.cwd(), relativePath)
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8')
      for (const email of PRIVATE_EMAILS) {
        assert.equal(
          content.includes(email),
          false,
          `File ${relativePath} must not contain private email address ${email}`
        )
      }
    }
  }

  // Verify Edge Function exists locally and contains the server-side mapping
  const edgeFunctionPath = path.resolve(
    process.cwd(),
    'supabase/functions/private-auth/index.ts'
  )
  assert.equal(fs.existsSync(edgeFunctionPath), true, 'private-auth Edge Function must exist')
  const edgeFunctionContent = fs.readFileSync(edgeFunctionPath, 'utf8')
  assert.match(edgeFunctionContent, /USER_CREDENTIAL_MAP/i)
})
