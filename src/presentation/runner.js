"use strict";

const fs = require("node:fs/promises");
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

async function exportResultsJson(results) {
  const outputPath = "logs/benchmark-results.json";
  await fs.mkdir("logs", { recursive: true });
  await fs.writeFile(
    outputPath,
    JSON.stringify(results, null, 2) + "\n",
    "utf8",
  );
  console.log(`\nResults exported to JSON: ${outputPath}`);
}
