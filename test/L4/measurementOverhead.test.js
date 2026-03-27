"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { runOperations } = require("../../src/application/benchmark");

describe("L4: Measurement overhead", () => {
  it("instrumentation overhead is ≤ 1% of median operation latency", async () => {
    const operationCount = 100_000;
    const store = {
      get: () => Buffer.alloc(1000),
      set: () => {},
      clear: () => {},
      close: () => {},
      size: () => 0,
    };
    const args = {
      store,
      operationCount,
      operationGenerator: () => ({ key: "k", operation: "READ" }),
      createFieldValue: () => null,
      createRecordValue: () => null,
      pickField: () => 0,
      fieldLength: 1,
      readAllFields: true,
      writeAllFields: false,
      updateRecordFields: (record) => record,
      projectRead: (record) => record,
    };

    // warmup
    await runOperations({ ...args, measure: true });
    const withoutTiming = await runOperations({ ...args, measure: false });
    const withTiming = await runOperations({ ...args, measure: true });
    const medianLatencyNs = Array.from(withTiming.allLatencies).sort((a, b) =>
      a < b ? -1 : a > b ? 1 : 0,
    )[Math.floor(operationCount / 2)];
    const overheadNs = withTiming.totalTime - withoutTiming.totalTime;
    const baselineNs = medianLatencyNs * BigInt(operationCount);
    const overheadPct =
      baselineNs === 0n ? 0 : (Number(overheadNs) * 100) / Number(baselineNs);

    assert.ok(
      overheadNs * 100n <= baselineNs,
      `should be <= 1%, got ${overheadPct.toFixed(2)}%`,
    );
  });
});
