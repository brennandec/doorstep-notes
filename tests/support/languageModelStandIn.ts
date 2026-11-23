// A LanguageModel global for unit tests that run the real SDK wrappers (H45). The ONLY_ON_DEVICE
// guard (src/firebase/deviceGuard.ts) refuses without it, as the browser would.
import { vi } from "vitest";

/** Puts a LanguageModel on globalThis whose availability() answers `state`. Undo with vi.unstubAllGlobals(). */
export function stubLanguageModel(state: string = "available"): { availability: ReturnType<typeof vi.fn> } {
  const lm = { availability: vi.fn(async () => state) };
  vi.stubGlobal("LanguageModel", lm);
  return lm;
}
