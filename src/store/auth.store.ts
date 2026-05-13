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
    { name: 'lifepilot-auth' },
  ),
)

export function getGoogleToken(): string {
  return localStorage.getItem('lifepilot_google_token') ?? ''
}
