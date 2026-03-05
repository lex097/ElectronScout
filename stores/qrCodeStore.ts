// stores/qrCodeStore.ts
// Holds QR code payload chunks for the QR display screen

import { create } from 'zustand';

type QrCodeState = {
  chunks: string[];
  setChunks: (chunks: string[]) => void;
  clearChunks: () => void;
};

export const useQrCodeStore = create<QrCodeState>((set) => ({
  chunks: [],
  setChunks: (chunks) => set({ chunks }),
  clearChunks: () => set({ chunks: [] }),
}));
