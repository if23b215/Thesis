"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const logsDir = path.join(root, "logs");

function resolve(command) {
  const result = spawnSync("bash", ["-lc", `command -v ${command}`], {
    encoding: "utf8",
  });

  assert.strictEqual(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function writeExecutable(filePath, content) {
  fs.writeFileSync(filePath, content, { mode: 0o755 });
}

describe("L3: Memory observation integration", () => {
  it(
    "captures Node RSS for every store, adds Redis RSS for Redis runs, and samples every 10 ms by default",
    { timeout: 20_000 },
    async () => {
      const tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), "memory-observation-"),
      );
      const binDir = path.join(tempDir, "bin");
      const fakeBenchmark = path.join(tempDir, "fake-benchmark.js");
      const suffix = `${process.pid}-${Date.now()}`;
      const mapStore = `memoryMapTest${suffix}`;
      const redisStore = `redisMemoryTest${suffix}`;
      const realSleep = resolve("sleep");
      const realPgrep = resolve("pgrep");
      const mapSleepLog = path.join(tempDir, "map-sleep.log");
      const redisSleepLog = path.join(tempDir, "redis-sleep.log");

      let redisProcess;

      fs.mkdirSync(binDir, { recursive: true });
      fs.mkdirSync(logsDir, { recursive: true });

      fs.writeFileSync(
        fakeBenchmark,
        `"use strict";

const fs = require("node:fs");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const storeName = process.argv[2];
  const retained = [];

  fs.mkdirSync("logs", { recursive: true });
  fs.writeFileSync(
    "logs/" + storeName + "-benchmark-results.json",
    JSON.stringify([{ storeName }], null, 2) + "\\n",
    "utf8",
  );

  retained.push(Buffer.alloc(32 * 1024 * 1024, 1));
  console.log("----- YCSB Workload A -----");
  await wait(80);

  retained.push(Buffer.alloc(32 * 1024 * 1024, 1));
  console.log("Warming up (10 ops)...");
  await wait(80);

  retained.push(Buffer.alloc(32 * 1024 * 1024, 1));
  console.log("Running benchmark (10 ops)...");
  await wait(60);
  retained.push(Buffer.alloc(32 * 1024 * 1024, 1));
  await wait(60);

  console.log("--- Results ---");
  await wait(20);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`,
        "utf8",
      );

      writeExecutable(
        path.join(binDir, "node"),
        `#!/usr/bin/env bash
set -euo pipefail

if [[ "\${1:-}" == "-e" ]]; then
  exec "\${REAL_NODE:?}" "$@"
fi

if [[ "\${1:-}" == "--trace-gc" && "\${4:-}" == "src/presentation/runner.js" ]]; then
  exec "\${REAL_NODE:?}" "\${FAKE_BENCHMARK:?}" "\${@:5}"
fi

exec "\${REAL_NODE:?}" "$@"
`,
      );

      writeExecutable(
        path.join(binDir, "pgrep"),
        `#!/usr/bin/env bash
set -euo pipefail

if [[ "\${1:-}" == "-f" && "\${2:-}" == "redis-server" && -n "\${TEST_REDIS_PID:-}" ]]; then
  printf '%s\\n' "\${TEST_REDIS_PID}"
  exit 0
fi

exec "\${REAL_PGREP:?}" "$@"
`,
      );

      writeExecutable(
        path.join(binDir, "sleep"),
        `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "\${1:-}" >> "\${TEST_SLEEP_LOG:?}"
exec "\${REAL_SLEEP:?}" "$@"
`,
      );

      const baseEnv = {
        ...process.env,
        PATH: `${binDir}:${process.env.PATH}`,
        REAL_NODE: process.execPath,
        REAL_PGREP: realPgrep,
        REAL_SLEEP: realSleep,
        FAKE_BENCHMARK: fakeBenchmark,
      };

      function runMemoryMonitor(storeName, sleepLog, extraEnv = {}) {
        const result = spawnSync(
          "bash",
          ["src/infrastructure/memoryMonitor.sh", storeName],
          {
            cwd: root,
            encoding: "utf8",
            maxBuffer: 16 * 1024 * 1024,
            env: {
              ...baseEnv,
              ...extraEnv,
              TEST_SLEEP_LOG: sleepLog,
            },
          },
        );

        assert.strictEqual(result.status, 0, result.stderr);

        const memory = JSON.parse(
          fs.readFileSync(
            path.join(logsDir, `${storeName}-benchmark-results.json`),
            "utf8",
          ),
        )[0].memory;
        const sleeps = fs
          .readFileSync(sleepLog, "utf8")
          .split(/\r?\n/)
          .filter(Boolean);

        return { memory, sleeps };
      }

      try {
        const mapRun = runMemoryMonitor(mapStore, mapSleepLog);

        assert.ok(mapRun.memory.RSS_pre_load > 0);
        assert.ok(mapRun.memory.RSS_post_load > mapRun.memory.RSS_pre_load);
        assert.ok(
          mapRun.memory.RSS_peak_during_benchmark > mapRun.memory.RSS_post_load,
        );
        assert.ok(mapRun.sleeps.length >= 10);
        assert.ok(mapRun.sleeps.every((value) => value === "0.01"));

        redisProcess = spawn(
          process.execPath,
          [
            "-e",
            "const retained=[Buffer.alloc(96*1024*1024,1)];setTimeout(()=>void retained,700);setTimeout(()=>process.exit(0),750);",
          ],
          {
            cwd: root,
            stdio: "ignore",
          },
        );

        await new Promise((resolve) => setTimeout(resolve, 50));

        const redisRun = runMemoryMonitor(redisStore, redisSleepLog, {
          TEST_REDIS_PID: String(redisProcess.pid),
        });

        assert.ok(mapRun.memory.RSS_pre_load < redisRun.memory.RSS_pre_load);
        assert.ok(mapRun.memory.RSS_post_load < redisRun.memory.RSS_post_load);
        assert.ok(
          mapRun.memory.RSS_peak_during_benchmark <
            redisRun.memory.RSS_peak_during_benchmark,
        );
        assert.ok(mapRun.memory.RSS_end > 0);
        assert.ok(redisRun.memory.RSS_end > 0);
      } finally {
        if (redisProcess) {
          try {
            redisProcess.kill("SIGTERM");
          } catch {}
        }

        fs.rmSync(path.join(logsDir, `${mapStore}-benchmark-results.json`), {
          force: true,
        });
        fs.rmSync(path.join(logsDir, `${redisStore}-benchmark-results.json`), {
          force: true,
        });
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    },
  );
});
