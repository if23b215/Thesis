"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { runOperations } = require("../../src/application/benchmark");
const { createWorkload } = require("../../src/domain/workloadGenerator");
const {
  createValueGenerator,
  createRecordGenerator,
  createFieldPicker,
  updateRecordFields,
  projectRead,
} = require("../../src/domain/valueGenerator");
const {
  getStoreFactory,
} = require("../../src/infrastructure/stores/storeFactory");

describe("L4: Measurement overhead", () => {
  it("instrumentation overhead is ≤ 1% of median operation latency", async () => {
    const recordCount = 10_000;
    const warmupCount = 10_000;
    const operationCount = 100_000;

    async function runStandardBenchmarkPath(measure) {
      const store = getStoreFactory("map")();

      try {
        const workload = "A";
        const fieldCount = 10;
        const fieldLength = 100;
        const requestDistribution = "zipfian";
        const readAllFields = true;
        const writeAllFields = false;

        const warmupOps = createWorkload({
          workload,
          recordCount,
          requestDistribution,
          seed: 1n,
        });
        const benchOps = createWorkload({
          workload,
          recordCount,
          requestDistribution,
          seed: 2n,
        });
        const loadRecords = createRecordGenerator({
          fieldCount,
          fieldLength,
          seed: 3n,
        });
        const createRecordValue = createRecordGenerator({
          fieldCount,
          fieldLength,
          seed: 4n,
        });
        const createFieldValue = createValueGenerator(fieldLength, 5n);
        const pickField = createFieldPicker({ fieldCount, seed: 6n });

        for (let i = 0; i < recordCount; i++) {
          store.set(`key${i}`, loadRecords());
        }

        await runOperations({
          store,
          operationCount: warmupCount,
          measure: false,
          operationGenerator: warmupOps,
          createFieldValue,
          createRecordValue,
          pickField,
          fieldLength,
          readAllFields,
          writeAllFields,
          updateRecordFields,
          projectRead,
        });

        return await runOperations({
          store,
          operationCount,
          measure,
          operationGenerator: benchOps,
          createFieldValue,
          createRecordValue,
          pickField,
          fieldLength,
          readAllFields,
          writeAllFields,
          updateRecordFields,
          projectRead,
        });
      } finally {
        await store.close();
      }
    }

    // warmup
    await runStandardBenchmarkPath(true);
    const withoutTiming = await runStandardBenchmarkPath(false);
    const withTiming = await runStandardBenchmarkPath(true);
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
