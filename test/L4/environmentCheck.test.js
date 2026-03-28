"use strict";
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { exportResultsJson } = require("../../src/presentation/logger.js");

describe("L4: Environment check", () => {
  it("Environment check: Node.js version, Redis version, SQLite version, OS, and CPU governor are logged and match expected values", async () => {
    await exportResultsJson([{ storeName: "L4Debug" }]);
    const outputPath = path.join("logs", "L4Debug-benchmark-results.json");
    const actual = JSON.parse(fs.readFileSync(outputPath, "utf8"))[0]
      .environment;

    assert.deepStrictEqual(actual, {
      node: "v24.13.0",
      redis: "8.4.0",
      sqlite: "3.51.2",
      os: "Ubuntu 24.04.3 LTS x86_64",
      governor: "performance",
    });
  });
});
