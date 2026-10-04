import type { RunState } from "@/lib/types";
const globalStore = globalThis as typeof globalThis & {
  ghostRuns?: Map<string, RunState>;
};
export const runs = (globalStore.ghostRuns ??= new Map<string, RunState>());
