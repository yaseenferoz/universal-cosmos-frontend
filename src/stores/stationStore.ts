import { create } from "zustand";

export const useStationStore = create<{ active: boolean; enter: () => void; leave: () => void }>((set) => ({
  active: false,
  enter: () => set({ active: true }),
  leave: () => set({ active: false }),
}));
