// orchestrates load, warmup, and measured benchmark phases.

"use strict";

async function loadData({ store, recordCount, recordGenerator, logger }) {
  const isAsyncStore = store.isAsync === true;
  logger.log(`Loading ${recordCount} records...`);

  for (let i = 0; i < recordCount; i++) {
    if (i % 100000 === 0) logger.log(`\n${i}/${recordCount} records loaded`);
    if (isAsyncStore) {
      await store.set(`user${i}`, recordGenerator());
    } else {
      store.set(`user${i}`, recordGenerator());
    }
  }

  const size = isAsyncStore ? await store.size() : store.size();
  logger.log(`Loaded ${size} records`);
}

async function runOperations({
  store,
  operationCount,
  operationGenerator,
  createFieldValue,
  pickField,
  updateRecordFields,
  measure,
}) {
  const isAsyncStore = store.isAsync === true;
  // Init array with operationCount entries on measure true
  const allLatencies = measure ? new BigInt64Array(operationCount) : null;
  const readLatencies = [];
  const updateLatencies = [];
  let readCount = 0;
  let updateCount = 0;

  const totalStart = process.hrtime.bigint();

  for (let i = 0; i < operationCount; i++) {
    const { key, operation } = operationGenerator();
    const isRead = operation === "READ";

    if (isRead) {
      readCount += 1;
    } else {
      updateCount += 1;
    }

    if (measure) {
      const start = process.hrtime.bigint();
      if (isAsyncStore) {
        if (isRead) {
          await store.get(key);
        } else {
          const current = await store.get(key);
          const nextRecord = updateRecordFields(current, {
            pickField,
            createFieldValue,
          });
          await store.set(key, nextRecord);
        }
      } else {
        if (isRead) {
          store.get(key);
        } else {
          const current = store.get(key);
          const nextRecord = updateRecordFields(current, {
            pickField,
            createFieldValue,
          });
          store.set(key, nextRecord);
        }
      }

      const latency = process.hrtime.bigint() - start;
      allLatencies[i] = latency;
      if (isRead) {
        readLatencies.push(latency);
      } else {
        updateLatencies.push(latency);
      }
    } else if (isAsyncStore) {
      if (isRead) {
        await store.get(key);
      } else {
        const current = await store.get(key);
        const nextRecord = updateRecordFields(current, {
          pickField,
          createFieldValue,
        });
        await store.set(key, nextRecord);
      }
    } else if (isRead) {
      store.get(key);
    } else {
      const current = store.get(key);
      const nextRecord = updateRecordFields(current, {
        pickField,
        createFieldValue,
      });
      store.set(key, nextRecord);
    }
  }

  const totalTime = process.hrtime.bigint() - totalStart;

  return {
    allLatencies,
    readLatencies,
    updateLatencies,
    readCount,
    updateCount,
    totalTime,
    operationCount,
  };
}

async function runBenchmark(config, deps) {
  const {
    workload = "A",
    recordCount = 10_000,
    operationCount = 100_000,
    warmupCount = 10_000,
    fieldCount = 10,
    fieldLength = 100,
    requestDistribution = "zipfian",
  } = config;

  const {
    createStore,
    createWorkload,
    createValueGenerator,
    createRecordGenerator,
    createFieldPicker,
    updateRecordFields,
    calculatePercentiles,
    calculateThroughput,
    storeName = "unknown",
    logger = console,
  } = deps;

  logger.log(`\n----- YCSB Workload ${workload} -----`);
  logger.log(`Records: ${recordCount}, Operations: ${operationCount}`);
  logger.log(`Store: ${storeName}`);

  const store = await createStore();
  try {
    logger.log(`Fields: ${fieldCount} x ${fieldLength} bytes`);
    logger.log(
      `Distribution: ${requestDistribution}`,
    );

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
    const createFieldValue = createValueGenerator(fieldLength, 5n);
    const pickField = createFieldPicker({ fieldCount, seed: 6n });

    // Load
    await loadData({
      store,
      recordCount,
      recordGenerator: loadRecords,
      logger,
    });

    // Warmup
    logger.log(`Warming up (${warmupCount} ops)...`);
    await runOperations({
      store,
      operationCount: warmupCount,
      measure: false,
      operationGenerator: warmupOps,
      createFieldValue,
      pickField,
      updateRecordFields,
    });

    // Benchmark
    logger.log(`Running benchmark (${operationCount} ops)...`);
    const measuredRun = await runOperations({
      store,
      operationCount,
      measure: true,
      operationGenerator: benchOps,
      createFieldValue,
      pickField,
      updateRecordFields,
    });

    const {
      allLatencies,
      readLatencies,
      updateLatencies,
      readCount,
      updateCount,
      totalTime,
      operationCount: ops,
    } = measuredRun;

    // Results
    const throughput = calculateThroughput(ops, totalTime);
    const overall = calculatePercentiles(allLatencies);
    const reads = calculatePercentiles(readLatencies);
    const updates = calculatePercentiles(updateLatencies);

    logger.log("\n--- Results ---");
    logger.log(`Throughput: ${throughput.toFixed(0)} ops/sec`);
    logger.log(`Operations: READ=${readCount}, UPDATE=${updateCount}`);
    logger.log("Latency (μs) overall:");
    logger.log(
      `  p50: ${overall.p50.toFixed(2)}  p95: ${overall.p95.toFixed(2)}  p99: ${overall.p99.toFixed(2)}  avg: ${overall.avg.toFixed(2)}`,
    );
    logger.log("Latency (μs) READ:");
    logger.log(
      `  p50: ${reads.p50.toFixed(2)}  p95: ${reads.p95.toFixed(2)}  p99: ${reads.p99.toFixed(2)}  avg: ${reads.avg.toFixed(2)}`,
    );
    logger.log("Latency (μs) UPDATE:");
    logger.log(
      `  p50: ${updates.p50.toFixed(2)}  p95: ${updates.p95.toFixed(2)}  p99: ${updates.p99.toFixed(2)}  avg: ${updates.avg.toFixed(2)}`,
    );

    return {
      config,
      storeName,
      throughput,
      overall,
      reads,
      updates,
      operationMix: { readCount, updateCount },
    };
  } finally {
    if (store && typeof store.close === "function") {
      await store.close();
    }
  }
}

async function runAllWorkloads(configs, deps) {
  const results = [];
  for (const config of configs) {
    results.push(await runBenchmark(config, deps));
  }
  return results;
}

module.exports = { runBenchmark, runAllWorkloads, runOperations };
