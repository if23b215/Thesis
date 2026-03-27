const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  calculatePercentiles,
  calculateThroughput,
} = require("../../src/domain/metrics");

describe("L1: Metrics", () => {
  it("latency: correct percentile calculation (p50, p95, p99, avg) against measured latencies", () => {
    // measured latencies in nanoseconds
    const latencies = Array.from(
      { length: 100 },
      (_, i) => BigInt(100 - i) * 1_000n,
    );

    const result = calculatePercentiles(latencies);

    assert.deepStrictEqual(result, {
      p50: 51,
      p95: 96,
      p99: 100,
      avg: 50.5,
    });
  });

  it("throughput: ops/sec computation matches expected value from total elapsed time", () => {
    const operationCount = 5_000;
    const totalElapsedNs = 2_000_000_000n; // 2 seconds

    const throughput = calculateThroughput(operationCount, totalElapsedNs);

    assert.strictEqual(throughput, 2_500);
  });
});
