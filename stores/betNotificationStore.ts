import { create } from 'zustand';

export interface BetResolution {
  matchNumber: number;
  won: boolean;
  payout: number;
}

interface BetNotificationState {
  notification: BetResolution | null;
  showNotification: (resolution: BetResolution) => void;
  dismissNotification: () => void;
}

export const useBetNotificationStore = create<BetNotificationState>((set) => ({
  notification: null,
  showNotification: (resolution) => set({ notification: resolution }),
  dismissNotification: () => set({ notification: null }),
}));
