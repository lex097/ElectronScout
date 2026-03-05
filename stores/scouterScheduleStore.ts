import { create } from 'zustand';

/** Tracks when user navigates to edit screen so list can skip invalidate on return. */
/** Tracks when schedule generation is in progress (persists across navigation). */
type ScouterScheduleState = {
  returningFromEdit: boolean;
  setReturningFromEdit: (value: boolean) => void;
  scheduleGenerating: boolean;
  setScheduleGenerating: (value: boolean) => void;
};

export const useScouterScheduleStore = create<ScouterScheduleState>((set) => ({
  returningFromEdit: false,
  setReturningFromEdit: (value) => set({ returningFromEdit: value }),
  scheduleGenerating: false,
  setScheduleGenerating: (value) => set({ scheduleGenerating: value }),
}));
