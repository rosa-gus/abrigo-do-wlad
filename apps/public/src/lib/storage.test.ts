import { afterEach, expect, test, vi } from "vitest";
import { cleanupObsoleteStorage, STORAGE_KEYS } from "./storage";

afterEach(() => vi.unstubAllGlobals());

function installStorage(keys: string[]) {
  const values = new Map(keys.map(key => [key, "saved"]));
  const storage = {
    get length() { return values.size; },
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => { values.delete(key); },
  };
  vi.stubGlobal("window", { localStorage: storage });
  return values;
}

test("removes consecutive obsolete cache entries and preserves other data", () => {
  const preserved = [
    STORAGE_KEYS.CACHE.DATA("all_recycle_points"),
    STORAGE_KEYS.CACHE.DATA("system_settings"),
    STORAGE_KEYS.UI.THEME,
    STORAGE_KEYS.UI.INDICATORS_VISIBLE,
    STORAGE_KEYS.FEEDBACK.PAGE_VOTE("/"),
    "app:v3:cache:data:future",
    "app:v1:unknown:data",
    "other:v1:cache:ttl:points",
    "app:v0:cache:data:invalid",
    "app:vNaN:cache:data:invalid",
  ];
  const values = installStorage([
    ...preserved,
    "app:v1:cache:ttl:all_recycle_points",
    "app:v1:cache:ttl:system_settings",
    "app:v1:cache:data:old",
  ]);
  cleanupObsoleteStorage();
  expect([...values.keys()]).toEqual(preserved);
  cleanupObsoleteStorage();
  expect([...values.keys()]).toEqual(preserved);
});

test("does not block startup when access to localStorage is denied", () => {
  vi.stubGlobal("window", {
    get localStorage() { throw new Error("Storage access denied"); },
  });
  expect(() => cleanupObsoleteStorage()).not.toThrow();
});

test("does not block startup when removing a key fails", () => {
  vi.stubGlobal("window", {
    localStorage: {
      length: 1,
      key: () => "app:v1:cache:ttl:points",
      removeItem: () => { throw new Error("Storage is read-only"); },
    },
  });
  expect(() => cleanupObsoleteStorage()).not.toThrow();
});
