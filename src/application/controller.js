// has the defaults and store selection.

"use strict";

const { getStoreFactory } = require("../infrastructure/stores/storeFactory");

const config = {
  recordCounts: [100_000],
  operationCount: 100_000,
  warmupCount: 10_000,
  workloads: ["A", "B", "C"],
  store: "map", // map minStore redisStore sqliteStore
  fieldCount: 10,
  fieldLength: 100,
  requestDistribution: "zipfian",
  readAllFields: true,
  writeAllFields: false,
};

function getRunConfigs() {
  return config.workloads.flatMap((workload) =>
    config.recordCounts.map((recordCount) => ({
      workload,
      recordCount,
      operationCount: config.operationCount,
      warmupCount: config.warmupCount,
      fieldCount: config.fieldCount,
      fieldLength: config.fieldLength,
      requestDistribution: config.requestDistribution,
      readAllFields: config.readAllFields,
      writeAllFields: config.writeAllFields,
    })),
  );
}

function createStore() {
  const factory = getStoreFactory(config.store);
  if (!factory) throw new Error(`Unknown store "${config.store}"`);
  return factory();
}

module.exports = { config, getRunConfigs, createStore };
