import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  _resetAgentMemoryProvider,
  getAgentMemoryProvider,
  isRedisIrisConfigured,
} from "../src/redis";

const KEYS = [
  "REDIS_IRIS_SERVER_URL",
  "REDIS_IRIS_STORE_ID",
  "REDIS_IRIS_API_KEY",
  "NEXT_PUBLIC_REDIS_ENABLED",
] as const;

describe("isRedisIrisConfigured", () => {
  const original: Partial<Record<(typeof KEYS)[number], string>> = {};

  beforeEach(() => {
    for (const key of KEYS) {
      original[key] = process.env[key];
      delete process.env[key];
    }
    _resetAgentMemoryProvider();
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
    _resetAgentMemoryProvider();
  });

  it("returns false when Redis Iris env vars are unset", () => {
    expect(isRedisIrisConfigured()).toBe(false);
  });

  it("returns false when NEXT_PUBLIC_REDIS_ENABLED is not 'true' even if creds present", () => {
    process.env.REDIS_IRIS_SERVER_URL = "https://iris.example.com";
    process.env.REDIS_IRIS_STORE_ID = "store-1";
    process.env.REDIS_IRIS_API_KEY = "key-1";
    process.env.NEXT_PUBLIC_REDIS_ENABLED = "false";
    expect(isRedisIrisConfigured()).toBe(false);
  });

  it("returns true when all Redis Iris env vars are set and enabled", () => {
    process.env.REDIS_IRIS_SERVER_URL = "https://iris.example.com";
    process.env.REDIS_IRIS_STORE_ID = "store-1";
    process.env.REDIS_IRIS_API_KEY = "key-1";
    process.env.NEXT_PUBLIC_REDIS_ENABLED = "true";
    expect(isRedisIrisConfigured()).toBe(true);
  });
});

describe("getAgentMemoryProvider", () => {
  beforeEach(() => {
    _resetAgentMemoryProvider();
  });

  afterEach(() => {
    _resetAgentMemoryProvider();
  });

  it("returns the in-memory session provider", () => {
    const provider = getAgentMemoryProvider();
    expect(provider.name).toBe("memory");
  });

  it("returns the same instance across calls (singleton)", () => {
    const a = getAgentMemoryProvider();
    const b = getAgentMemoryProvider();
    expect(a).toBe(b);
  });
});
