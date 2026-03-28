"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  storeFactories,
} = require("../../src/infrastructure/stores/storeFactory");
const backends = Array.from(storeFactories.entries()).map(
  ([name, factory]) => ({ name, factory }),
);

describe("L2: StoreContract", () => {
  it("common interface: each store adapter correctly implements get(key) and set(key, value)", async () => {
    for (const backend of backends) {
      const store = await Promise.resolve(backend.factory());

      try {
        assert.strictEqual(
          typeof store.get,
          "function",
          `${backend.name}: get(key) must be implemented`,
        );
        assert.strictEqual(
          typeof store.set,
          "function",
          `${backend.name}: set(key, value) must be implemented`,
        );
      } finally {
        if (store && typeof store.close === "function") {
          await Promise.resolve(store.close());
        }
      }
    }
  });

  it("round-trip integrity: value written with set is returned identically by get", async () => {
    const value = "L2-round-trip-value";

    for (const backend of backends) {
      const store = await Promise.resolve(backend.factory());
      const key = `${backend.name}-${Date.now()}`;

      try {
        await Promise.resolve(store.set(key, value));
        const actual = await Promise.resolve(store.get(key));
        assert.strictEqual(
          actual,
          value,
          `${backend.name}: round-trip value mismatch`,
        );
      } finally {
        if (store && typeof store.close === "function") {
          await Promise.resolve(store.close());
        }
      }
    }
  });

  it("get on non-existent key returns null or undefined", async () => {
    const stores = [];

    try {
      for (const backend of backends) {
        const store = await Promise.resolve(backend.factory());
        stores.push({ backendName: backend.name, store });

        const missingValue = await Promise.resolve(
          store.get(`${backend.name}-${Date.now()}`),
        );

        assert.ok(
          missingValue === null || missingValue === undefined,
          `${backend.name}: missing key must return null or undefined, got ${String(missingValue)}`,
        );
      }
    } finally {
      for (const entry of stores) {
        if (entry.store && typeof entry.store.close === "function") {
          await Promise.resolve(entry.store.close());
        }
      }
    }
  });

  it("lifecycle: clear() and close() execute without error and release resources", async () => {
    for (const backend of backends) {
      const store = await Promise.resolve(backend.factory());
      const key = `${backend.name}-${Date.now()}`;

      await Promise.resolve(store.set(key, "before-clear"));
      await Promise.resolve(store.clear());

      const afterClear = await Promise.resolve(store.get(key));
      assert.ok(
        afterClear === null || afterClear === undefined,
        `${backend.name}: clear() did not remove previously written key`,
      );

      await Promise.resolve(store.close());

      const reopened = await Promise.resolve(backend.factory());
      const reopenKey = `${backend.name}-${Date.now()}`;

      try {
        await Promise.resolve(reopened.set(reopenKey, "ok"));
        const reopenedValue = await Promise.resolve(reopened.get(reopenKey));
        assert.strictEqual(
          reopenedValue,
          "ok",
          `${backend.name}: store unusable after close()/re-open`,
        );
      } finally {
        if (reopened && typeof reopened.close === "function") {
          await Promise.resolve(reopened.close());
        }
      }
    }
  });
});
