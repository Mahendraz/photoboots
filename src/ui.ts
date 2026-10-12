import { create } from 'zustand'

interface UiState {
  loginOpen: boolean
  openLogin: () => void
  closeLogin: () => void
}

export const useUi = create<UiState>()((set) => ({
  loginOpen: false,
  openLogin: () => set({ loginOpen: true }),
  closeLogin: () => set({ loginOpen: false }),
}))
