"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const outputPath = path.join(root, "logs", "map-benchmark-results.json");

describe("L4: Output format", () => {
  it(
    "Output format: results are written in valid JSON or CSV with the benchmark configuration included",
    { timeout: 120_000 },
    () => {
      execFileSync("npm", ["start"], {
        cwd: root,
        stdio: "ignore",
      });

      const parsed = JSON.parse(fs.readFileSync(outputPath, "utf8"));

      assert.ok(Array.isArray(parsed));
      assert.ok(parsed.length > 0);

      parsed.forEach((result) => {
        assert.ok(result && typeof result === "object");
        assert.ok(result.config && typeof result.config === "object");
        assert.strictEqual(typeof result.config.workload, "string");
        assert.strictEqual(typeof result.config.recordCount, "number");
        assert.strictEqual(typeof result.config.operationCount, "number");
      });
    },
  );
});
