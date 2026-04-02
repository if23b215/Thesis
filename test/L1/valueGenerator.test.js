const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  createValueGenerator,
  createRecordGenerator,
  updateRecordFields,
} = require("../../src/domain/valueGenerator");

describe("L1: ValueGenerator", () => {
  it("deterministic value output for identical seeds and parameters", () => {
    const size = 100;
    const seed = 40n;

    const generator1 = createValueGenerator(size, seed);
    const generator2 = createValueGenerator(size, seed);

    const value1 = generator1();
    const value2 = generator2();

    assert.deepStrictEqual(value1, value2);
  });

  it("generated records equal fieldCount x fieldLength bytes", () => {
    const fieldCount = 10;
    const fieldLength = 100;
    const seed = 30n;

    const generator = createRecordGenerator({ fieldCount, fieldLength, seed });
    const record = generator();
    const fields = Object.keys(record);
    const totalBytes = Object.values(record).reduce(
      (sum, value) => sum + Buffer.byteLength(value, "utf8"),
      0,
    );

    assert.strictEqual(fields.length, fieldCount);
    assert.deepStrictEqual(fields, [
      "field0",
      "field1",
      "field2",
      "field3",
      "field4",
      "field5",
      "field6",
      "field7",
      "field8",
      "field9",
    ]);
    for (const value of Object.values(record)) {
      assert.strictEqual(Buffer.byteLength(value, "utf8"), fieldLength);
    }
    assert.strictEqual(totalBytes, fieldCount * fieldLength);
  });
});
