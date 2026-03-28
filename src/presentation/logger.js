"use strict";

const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const os = require("node:os");

async function exportResultsJson(results) {
  const outputPath = `logs/${results[0].storeName}-benchmark-results.json`;
  const environment = detectEnvironment();
  await fs.mkdir("logs", { recursive: true });
  await fs.writeFile(
    outputPath,
    JSON.stringify(
      results.map((result) => ({ ...result, environment })),
      null,
      2,
    ) + "\n",
    "utf8",
  );
  console.log(`\nResults exported to JSON: ${outputPath}`);
}

function detectEnvironment() {
  const { execFileSync } = require("node:child_process");
  const Database = require("better-sqlite3");
  const db = new Database(":memory:");

  try {
    return {
      node: process.version,
      redis: (() => {
        try {
          return (
            (execFileSync("redis-server", ["--version"], {
              encoding: "utf8",
              stdio: ["ignore", "pipe", "ignore"],
            }).match(/\bv=([0-9.]+)/) || [])[1] || "unavailable"
          );
        } catch {
          return "unavailable";
        }
      })(),
      sqlite: db.prepare("select sqlite_version() as v").get().v,
      os: `${fsSync.readFileSync("/etc/os-release", "utf8").match(/^PRETTY_NAME="?(.+?)"?$/m)?.[1]} ${os.machine()}`,
      governor: (() => {
        for (const p of [
          "/sys/devices/system/cpu/cpu0/cpufreq/scaling_governor",
          "/sys/devices/system/cpu/cpufreq/policy0/scaling_governor",
        ]) {
          try {
            return fsSync.readFileSync(p, "utf8").trim();
          } catch {}
        }
        return "unavailable";
      })(),
    };
  } finally {
    db.close();
  }
}

module.exports = { exportResultsJson, detectEnvironment };