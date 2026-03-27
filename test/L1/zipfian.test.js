const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  ScrambledZipfianGenerator,
  XorShift128Plus,
  ZIPFIAN_CONSTANT,
} = require("../../src/domain/zipfianGenerator");

function buildSequence(seed, length, min = 0, max = 9_999) {
  const generator = new ScrambledZipfianGenerator(
    min,
    max,
    ZIPFIAN_CONSTANT,
    new XorShift128Plus(BigInt(seed)),
  );

  // new array with length amount of values
  // values are generator.nextValue()
  return Array.from({ length }, () => generator.nextValue());
}

describe("L1: ScrambledZipfianGenerator", () => {
  it("same seed produces same output across two runs", () => {
    const firstRun = buildSequence(123n, 5_000);
    const secondRun = buildSequence(123n, 5_000);

    assert.deepStrictEqual(firstRun, secondRun);
  });

  it("different seed produces not same output across two runs", () => {
    const firstRun = buildSequence(123n, 5_000);
    const secondRun = buildSequence(124n, 5_000);

    assert.notDeepStrictEqual(firstRun, secondRun);
  });

  it("top 1% of keys account for >= 50% of accesses", () => {
    const generator = new ScrambledZipfianGenerator(
      0,
      1_000_000 - 1,
      ZIPFIAN_CONSTANT,
      new XorShift128Plus(42n),
    );

    const frequencies = new Map();
    for (let i = 0; i < 50_000; i++) {
      const key = generator.nextValue();
      frequencies.set(key, (frequencies.get(key) ?? 0) + 1);
    }

    const sortedFrequencies = Array.from(frequencies.values()).sort(
      (a, b) => b - a,
    );

    const topAccesses = sortedFrequencies
      .slice(0, Math.floor(1_000_000 * 0.01))
      .reduce((sum, count) => sum + count, 0);

    const topShare = topAccesses / 50_000;

    assert.ok(
      topShare >= 0.5,
      `Expected top 1% to account for at least 50%, got ${(topShare * 100).toFixed(2)}%`,
    );
  });
});
