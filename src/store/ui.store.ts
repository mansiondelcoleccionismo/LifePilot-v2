import { create } from 'zustand'

interface UIState {
  sidebarCollapsed: boolean
  toggleSidebarCollapse: () => void
  mobileMenuOpen: boolean
  setMobileMenuOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebarCollapse: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  mobileMenuOpen: false,
  setMobileMenuOpen: (open) => set({ mobileMenuOpen: open }),
}))