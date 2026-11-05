import { createContext } from 'react'

export const AuthContext = createContext({
  session: null,
  user: null,
  profile: null,
  isAuthorized: false,
  loading: true,
  dbConfigured: true,
  isPasswordRecovery: false,
  setIsPasswordRecovery: () => {},
  login: async () => ({ error: null }),
  logout: async () => {},
  resetPassword: async () => ({ error: null }),
  updatePassword: async () => ({ error: null }),
  refreshProfile: async () => {},
})
