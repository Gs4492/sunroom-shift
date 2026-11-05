import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { supabase } from './supabaseClient'
import { AuthContext } from './AuthContextDef'

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [authorizedUserId, setAuthorizedUserId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dbConfigured, setDbConfigured] = useState(true)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)

  // Track async check versions to prevent stale in-flight queries from overwriting state
  const authCheckVersionRef = useRef(0)
  // Track last evaluated user ID to prevent duplicate authorization checks
  const lastCheckedUserIdRef = useRef(null)
  // Track whether an auth event has been received to prevent getSession race
  const authEventReceivedRef = useRef(false)
  // Track current user ref for real-time validation inside async operations
  const currentUserRef = useRef(null)

  // Derived authorization strictly bound to the exact active authenticated user ID
  const isAuthorized = Boolean(
    user &&
    authorizedUserId === user.id &&
    profile &&
    profile.id === user.id &&
    ['Geet', 'Nikhil', 'Parul'].includes(profile.name)
  )

  // Derived profile strictly bound to the exact active authenticated user ID
  const effectiveProfile = (user && profile && profile.id === user.id) ? profile : null

  const checkUserAuthorization = useCallback(async (currentUser, { isAccountChange = false } = {}) => {
    const version = ++authCheckVersionRef.current
    const targetUserId = currentUser?.id || null

    if (!currentUser || !targetUserId) {
      lastCheckedUserIdRef.current = null
      setAuthorizedUserId(null)
      setProfile(null)
      return
    }

    // Only invalidate authorization immediately on genuine account changes / sign-in,
    // not during a normal profile refresh for the same authenticated user.
    if (isAccountChange) {
      setAuthorizedUserId(null)
      setProfile(null)
    }

    try {
      const { data, error } = await supabase
        .from('authorized_private_users')
        .select('id, name')
        .eq('id', targetUserId)
        .maybeSingle()

      // Stale check: discard response if a newer check or user change was triggered
      if (
        version !== authCheckVersionRef.current ||
        targetUserId !== currentUserRef.current?.id
      ) return

      if (error) {
        const isTableMissing =
          error.code === '42P01' ||
          error.code === 'PGRST204' ||
          error.code === 'PGRST200' ||
          error.code === 'PGRST205' ||
          error.status === 404 ||
          error.message?.toLowerCase().includes('does not exist') ||
          error.message?.toLowerCase().includes('relation') ||
          error.message?.toLowerCase().includes('could not find the table') ||
          (error.message?.toLowerCase().includes('table') &&
            error.message?.toLowerCase().includes('not found'))

        if (isTableMissing) {
          console.warn(
            'authorized_private_users table does not exist yet. Please run migration 20261105000100_create_private_notes_and_tasks.sql.'
          )
          setDbConfigured(false)
        } else {
          console.error('Error checking authorization status:', error.message)
        }
        setAuthorizedUserId(null)
        setProfile(null)
        return
      }

      setDbConfigured(true)

      // Bind authorization strictly to the authorized user allowlist
      if (data && ['Geet', 'Nikhil', 'Parul'].includes(data.name)) {
        setAuthorizedUserId(targetUserId)
        setProfile(data)
      } else {
        setAuthorizedUserId(null)
        setProfile(null)
      }
    } catch (err) {
      if (
        version !== authCheckVersionRef.current ||
        targetUserId !== currentUserRef.current?.id
      )
        return
      console.error('Authorization check failed:', err)
      setAuthorizedUserId(null)
      setProfile(null)
    }
  }, [])

  // Synchronize user identity with authorization check
  useEffect(() => {
    const currentId = user?.id || null
    currentUserRef.current = user

    if (lastCheckedUserIdRef.current === currentId) {
      return
    }

    lastCheckedUserIdRef.current = currentId
    // Genuine account switch or initial sign-in: immediately invalidate previous user credentials
    setAuthorizedUserId(null)
    setProfile(null)
    checkUserAuthorization(user, { isAccountChange: true })
  }, [user, checkUserAuthorization])

  // Initial session restoration and auth state change subscription
  useEffect(() => {
    let mounted = true

    // Set up onAuthStateChange first and mark authEventReceivedRef on events
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      authEventReceivedRef.current = true
      if (!mounted) return

      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true)
      } else if (event === 'SIGNED_OUT') {
        setIsPasswordRecovery(false)
      }

      const nextUser = newSession?.user || null
      currentUserRef.current = nextUser
      setSession(newSession)
      setUser(nextUser)
      setLoading(false)
    })

    async function initializeAuth() {
      try {
        const {
          data: { session: initialSession },
          error,
        } = await supabase.auth.getSession()

        if (error) {
          console.error('Error fetching initial session:', error.message)
        }

        // If an onAuthStateChange event has already been received,
        // do not allow a delayed getSession() response to overwrite it.
        if (mounted && !authEventReceivedRef.current) {
          const initialUser = initialSession?.user || null
          currentUserRef.current = initialUser
          setSession(initialSession)
          setUser(initialUser)
          setLoading(false)
        }
      } catch (err) {
        console.error('Failed to restore session:', err)
        if (mounted && !authEventReceivedRef.current) {
          setLoading(false)
        }
      }
    }

    initializeAuth()

    return () => {
      mounted = false
      subscription?.unsubscribe()
    }
  }, [])

  const login = useCallback(async (username, password) => {
    try {
      const cleanUsername = String(username || '').trim().toLowerCase()
      if (!cleanUsername || !password) {
        return { data: null, error: new Error('Username and password are required.') }
      }

      // Authenticate against Supabase Auth via server-side Edge Function
      const { data, error } = await supabase.functions.invoke('private-auth', {
        body: {
          action: 'login',
          username: cleanUsername,
          password,
        },
      })

      if (error) {
        return {
          data: null,
          error: new Error(error.message || 'Invalid username or password.'),
        }
      }

      if (data?.error) {
        return {
          data: null,
          error: new Error(data.error),
        }
      }

      if (data?.session?.access_token && data?.session?.refresh_token) {
        // Establish the session in the local Supabase client
        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        })

        if (sessionError) {
          return { data: null, error: sessionError }
        }

        if (sessionData?.session) {
          currentUserRef.current = sessionData.user
          setSession(sessionData.session)
          setUser(sessionData.user)
        }

        return { data: sessionData, error: null }
      }

      return { data: null, error: new Error('Invalid authentication response from server.') }
    } catch (err) {
      return { data: null, error: err }
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('Logout error from Supabase:', error.message)
        return { error }
      }

      // Successful sign-out: invalidate pending checks and clear auth state
      authCheckVersionRef.current++
      lastCheckedUserIdRef.current = null
      currentUserRef.current = null
      setSession(null)
      setUser(null)
      setAuthorizedUserId(null)
      setProfile(null)
      setIsPasswordRecovery(false)
      return { error: null }
    } catch (err) {
      console.error('Logout exception:', err)
      return { error: err }
    }
  }, [])

  const resetPassword = useCallback(async (username) => {
    try {
      const cleanUsername = String(username || '').trim().toLowerCase()
      if (!cleanUsername) {
        return { data: null, error: new Error('Username is required.') }
      }

      // Initiate password recovery through server-side Edge Function
      const { data, error } = await supabase.functions.invoke('private-auth', {
        body: {
          action: 'recover-password',
          username: cleanUsername,
          redirectTo: new URL(import.meta.env.BASE_URL, window.location.origin).toString(),
        },
      })

      if (error) {
        return {
          data: null,
          error: new Error(error.message || 'Could not process password recovery.'),
        }
      }

      if (data?.error) {
        return {
          data: null,
          error: new Error(data.error),
        }
      }

      return { data, error: null }
    } catch (err) {
      return { data: null, error: err }
    }
  }, [])

  const updatePassword = useCallback(async (newPassword) => {
    try {
      const { data, error } = await supabase.auth.updateUser({
        password: newPassword,
      })
      if (error) {
        return { data: null, error }
      }
      setIsPasswordRecovery(false)
      return { data, error: null }
    } catch (err) {
      return { data: null, error: err }
    }
  }, [])

  const refreshProfile = useCallback(async () => {
    if (user) {
      await checkUserAuthorization(user, { isAccountChange: false })
    }
  }, [user, checkUserAuthorization])

  const value = useMemo(
    () => ({
      session,
      user,
      profile: effectiveProfile,
      isAuthorized,
      loading,
      dbConfigured,
      isPasswordRecovery,
      setIsPasswordRecovery,
      login,
      logout,
      resetPassword,
      updatePassword,
      refreshProfile,
    }),
    [
      session,
      user,
      effectiveProfile,
      isAuthorized,
      loading,
      dbConfigured,
      isPasswordRecovery,
      login,
      logout,
      resetPassword,
      updatePassword,
      refreshProfile,
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
