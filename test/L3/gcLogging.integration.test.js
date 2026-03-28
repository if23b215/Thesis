"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

describe("L3: GC Integration", () => {
  it(
    "GC logging: output contains both YCSB and GC lines",
    { timeout: 40_000 },
    () => {
      const root = path.resolve(__dirname, "../..");
      const logPath = path.join(root, "logs", "gc-trace.log");
      // limit max heap to make it fail
      const nodeOptions =
        `${process.env.NODE_OPTIONS ? `${process.env.NODE_OPTIONS} ` : ""}--max-old-space-size=16`.trim();

      spawnSync("npm", ["run", "log"], {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, NODE_OPTIONS: nodeOptions },
      });

      const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/);
      assert.ok(lines.some((line) => line.includes("YCSB Workload")));
      // [324867:0x70d0000]      203 ms:
      assert.ok(lines.some((line) => /^\[\d+:[^\]]+\]\s+\d+\sms:/.test(line)));
    },
  );
});
