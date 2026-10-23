import { create } from 'zustand'

interface UiState {
  loginOpen: boolean
  openLogin: () => void
  closeLogin: () => void
  /** Lembar "Mulai estafet" (pilih jatah per orang + peringatan 4 jam). */
  estafetOpen: boolean
  setEstafetOpen: (open: boolean) => void
}

export const useUi = create<UiState>()((set) => ({
  loginOpen: false,
  openLogin: () => set({ loginOpen: true }),
  closeLogin: () => set({ loginOpen: false }),
  estafetOpen: false,
  setEstafetOpen: (estafetOpen) => set({ estafetOpen }),
}))
