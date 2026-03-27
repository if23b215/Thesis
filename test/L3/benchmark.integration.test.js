"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { runBenchmark } = require("../../src/application/benchmark");
const {
  createWorkload,
  WORKLOADS,
} = require("../../src/domain/workloadGenerator");
const {
  createValueGenerator,
  createRecordGenerator,
  createFieldPicker,
  updateRecordFields,
  projectRead,
} = require("../../src/domain/valueGenerator");
const {
  calculatePercentiles,
  calculateThroughput,
} = require("../../src/domain/metrics");
const {
  getStoreFactory,
  storeFactories,
} = require("../../src/infrastructure/stores/storeFactory");

const benchmarkDeps = {
  createWorkload,
  createValueGenerator,
  createRecordGenerator,
  createFieldPicker,
  updateRecordFields,
  projectRead,
  calculatePercentiles,
  calculateThroughput,
};

describe("L3: Benchmark Integration", () => {
  it("Load phase: recordCount records are present in the store after loading", async () => {
    const recordCount = 250;
    const store = getStoreFactory("map")();
    // Overrides close so we can get the size
    store.close = () => {};

    await runBenchmark(
      {
        recordCount,
        warmupCount: 0,
        operationCount: 0,
      },
      {
        ...benchmarkDeps,
        createStore: () => store,
        logger: { log: () => {} },
      },
    );

    assert.strictEqual(store.size(), recordCount);
  });

  it(
    "Dataset scaling: load phase completes and store contains the expected record count for each configured dataset size (1K, 10K, 100K, 1M, 10M)",
    { timeout: 300_000 },
    async () => {
      const datasetSizes = [1_000, 10_000, 100_000, 1_000_000, 10_000_000];

      for (const recordCount of datasetSizes) {
        let size = 0;
        const store = {
          get: () => null,
          set: () => {
            size += 1;
          },
          clear: () => {},
          close: () => {},
          size: () => size,
        };

        // 1 byte records to achive resonable times
        await runBenchmark(
          {
            workload: "A",
            recordCount,
            warmupCount: 0,
            operationCount: 0,
            fieldCount: 1,
            fieldLength: 1,
          },
          {
            ...benchmarkDeps,
            createStore: () => store,
            storeName: "counting",
            logger: { log: () => {} },
          },
        );

        assert.strictEqual(
          store.size(),
          recordCount,
          `recordCount=${recordCount}`,
        );
      }
    },
  );

  it("End-to-end run: small-scale benchmark completes without error for each store and workload combination.", async () => {
    const recordCount = 1_000;
    const operationCount = 1_000;
    const warmupCount = 1_000;
    const workloadNames = Object.keys(WORKLOADS);
    const stores = Array.from(storeFactories.entries());

    for (const [storeName, createStore] of stores) {
      for (const workload of workloadNames) {
        await assert.doesNotReject(
          () =>
            runBenchmark(
              {
                workload,
                recordCount,
                operationCount,
                warmupCount,
              },
              {
                ...benchmarkDeps,
                createStore,
                storeName,
                logger: { log: () => {} },
              },
            ),
          `${storeName} x ${workload} should complete without error`,
        );
      }
    }
  });

  it("Warmup phase: measured latencies exclude warmup operations; measured operation count equals operationCount", async () => {
    const operationCount = 300;
    const warmupCount = 2_000;

    const result = await runBenchmark(
      {
        workload: "A",
        recordCount: 1_000,
        operationCount,
        warmupCount,
      },
      {
        ...benchmarkDeps,
        createStore: () => getStoreFactory("map")(),
        storeName: "map",
        logger: { log: () => {} },
      },
    );

    assert.strictEqual(
      result.operationMix.readCount + result.operationMix.updateCount,
      operationCount,
    );
  });

  it("Latency timer: aggregate latencies are measured via process.hrtime.bigint()", async () => {
    const operationCount = 200;
    const incrementNs = 1_000_000n; // 1 ms
    const originalHrtimeBigint = process.hrtime.bigint;
    let callCount = 0;
    let fakeNowNs = 0n;
    // Mocks process.hrtime.bigint() so each call is 1 ms later
    process.hrtime.bigint = () => {
      callCount += 1;
      fakeNowNs += incrementNs;
      return fakeNowNs;
    };

    try {
      const result = await runBenchmark(
        {
          workload: "A",
          recordCount: 1_000,
          warmupCount: 0,
          operationCount,
        },
        {
          ...benchmarkDeps,
          createStore: () => getStoreFactory("map")(),
          storeName: "map",
          logger: { log: () => {} },
        },
      );

      assert.ok(
        callCount >= operationCount * 2,
        "expected hrtime.bigint to be called per measured operation",
      );
      // get us have ns so we /1000
      assert.strictEqual(result.overall.p50, Number(incrementNs) / 1000);
      assert.strictEqual(result.overall.p95, Number(incrementNs) / 1000);
      assert.strictEqual(result.overall.p99, Number(incrementNs) / 1000);
      assert.strictEqual(result.overall.avg, Number(incrementNs) / 1000);
    } finally {
      // not scoped, must be reset
      process.hrtime.bigint = originalHrtimeBigint;
    }
  });
});
