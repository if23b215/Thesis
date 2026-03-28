"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const resultsPath = path.join(root, "logs", "map-benchmark-results.json");

function coefficientOfVariation(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return mean === 0 ? 0 : Math.sqrt(variance) / mean;
}

describe("L4: Multi-run stability", () => {
  it(
    "three consecutive runs with the same configuration produce p50 latencies with coefficient of variation <= 5%",
    { timeout: 120_000 },
    () => {
      const runs = [];

      for (let i = 0; i < 3; i++) {
        execFileSync("npm", ["start"], {
          cwd: root,
          stdio: "ignore",
        });
        runs.push(JSON.parse(readFileSync(resultsPath, "utf8")));
      }

      runs[0].forEach((result, index) => {
        const p50s = runs.map((run) => run[index].overall.p50);
        const cv = coefficientOfVariation(p50s);

        assert.ok(
          cv <= 0.05,
          `expected CV <= 5% for workload ${result.config.workload}, got ${(cv * 100).toFixed(2)}% from ${p50s.join(", ")}`,
        );
      });
    },
  );
});
