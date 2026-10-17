import { afterEach, expect, it, vi } from "vitest";
vi.mock("@daily-co/daily-js", () => ({ default: {} }));
import { destroyDailyCall } from "../lib/dailyCallSingleton";
afterEach(() => vi.unstubAllGlobals());
it("destroys a failed old call without clearing a newer call", async () => {
  const old = { leave: vi.fn().mockRejectedValue(new Error("offline")), destroy: vi.fn().mockResolvedValue(undefined) };
  const next = {};
  vi.stubGlobal("window", { __tavusDailyCallObject: old });
  const cleanup = destroyDailyCall();
  expect(window.__tavusDailyCallObject).toBeNull();
  window.__tavusDailyCallObject = next as never;
  await cleanup;
  expect(old.destroy).toHaveBeenCalledOnce();
  expect(window.__tavusDailyCallObject).toBe(next);
});
