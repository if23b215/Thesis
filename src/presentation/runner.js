"use strict";

const { runAllWorkloads } = require("../application/benchmark");
const {
  config,
  getRunConfigs,
  createStore,
} = require("../application/controller");
const { createWorkload } = require("../domain/workloadGenerator");
const {
  createValueGenerator,
  createRecordGenerator,
  createFieldPicker,
  updateRecordFields,
  projectRead,
} = require("../domain/valueGenerator");
const {
  calculatePercentiles,
  calculateThroughput,
} = require("../domain/metrics");
const { exportResultsJson } = require("./logger.js");

// hard parse the argument given as the store to use to bench
// npm start minStore -> config.store = minStore
if (process.argv[2]) config.store = process.argv[2];

async function main() {
  const deps = {
    createStore,
    createWorkload,
    createValueGenerator,
    createRecordGenerator,
    createFieldPicker,
    updateRecordFields,
    projectRead,
    calculatePercentiles,
    calculateThroughput,
    storeName: config.store,
  };

  const results = await runAllWorkloads(getRunConfigs(), deps);
  await exportResultsJson(results);
}

main().catch(console.error);
