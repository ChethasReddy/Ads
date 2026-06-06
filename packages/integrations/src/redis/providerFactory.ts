import {
  _resetInMemoryStore,
  getSessionProvider,
  InMemoryProvider,
} from "./inMemoryProvider";
import { _resetRedisIrisClient } from "./redisIrisProvider";

/**
 * Returns the process-local session provider for feedback logs, interruption
 * mode, and next-ad cache. Arc entries and preferences route through the
 * Redis Iris wrappers in memoryWrappers.ts when configured.
 */
export function getAgentMemoryProvider(): InMemoryProvider {
  return getSessionProvider();
}

/** @deprecated Use getAgentMemoryProvider. Kept for routes not yet migrated. */
export const getMemoryProvider = getAgentMemoryProvider;

/** Test-only: forget cached providers. */
export function _resetAgentMemoryProvider(): void {
  _resetInMemoryStore();
  _resetRedisIrisClient();
}
