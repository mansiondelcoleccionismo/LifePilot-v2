import { create } from 'zustand'

interface UserState {
  name: string
  email: string
  avatarUrl: string | null
}

export const useUserStore = create<UserState>(() => ({
  name: 'Daniel',
  email: '50690.daniel@gmail.com',
  avatarUrl: null,
}))
