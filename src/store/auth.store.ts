import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface GoogleUser {
  name: string
  email: string
  picture: string
  accessToken: string
}

interface AuthState {
  isLoggedIn: boolean
  user: GoogleUser | null
  login: (user: GoogleUser) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isLoggedIn: false,
      user: null,
      login: (user) => {
        localStorage.setItem('lifepilot_google_token', user.accessToken)
        set({ isLoggedIn: true, user })
      },
      logout: () => {
        localStorage.removeItem('lifepilot_google_token')
        set({ isLoggedIn: false, user: null })
      },
    }),
    {
      name: 'lifepilot-auth',
      // After page reload, persist rehydrates state but does NOT re-run login().
      // Re-sync the token key so getGoogleToken() works immediately.
      onRehydrateStorage: () => (state) => {
        if (state?.user?.accessToken) {
          localStorage.setItem('lifepilot_google_token', state.user.accessToken)
        }
      },
    },
  ),
)

export function getGoogleToken(): string {
  // Direct key (set on login / rehydration)
  const direct = localStorage.getItem('lifepilot_google_token')
  if (direct) return direct
  // Last-resort: read from persisted Zustand JSON in case key was cleared
  try {
    const stored = JSON.parse(localStorage.getItem('lifepilot-auth') ?? '{}') as { state?: { user?: { accessToken?: string } } }
    return stored?.state?.user?.accessToken ?? ''
  } catch {
    return ''
  }
}
