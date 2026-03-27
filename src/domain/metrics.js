"use strict";

function calculatePercentiles(latencies) {
  if (!latencies || latencies.length === 0) {
    return { p50: 0, p95: 0, p99: 0, avg: 0 };
  }

  const sorted = Array.from(latencies).sort((a, b) => Number(a - b));
  const len = sorted.length;

  const nsToUs = (ns) => Number(ns) / 1000;

  return {
    p50: nsToUs(sorted[Math.floor(len * 0.5)]),
    p95: nsToUs(sorted[Math.floor(len * 0.95)]),
    p99: nsToUs(sorted[Math.floor(len * 0.99)]),
    avg: nsToUs(sorted.reduce((a, b) => a + b, 0n) / BigInt(len)),
  };
}

function calculateThroughput(operationCount, totalTimeNs) {
  return operationCount / (Number(totalTimeNs) / 1e9);
}

module.exports = { calculatePercentiles, calculateThroughput };
