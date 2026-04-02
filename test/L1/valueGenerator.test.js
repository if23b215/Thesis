const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  createValueGenerator,
  createRecordGenerator,
  updateRecordFields,
  projectRead,
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
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
    ]);
    for (const value of Object.values(record)) {
      assert.strictEqual(Buffer.byteLength(value, "utf8"), fieldLength);
    }
    assert.strictEqual(totalBytes, fieldCount * fieldLength);
  });

  it("single-field updates replace only the chosen field", () => {
    const original = {
      0: "a".repeat(100),
      1: "b".repeat(100),
    };

    const updated = updateRecordFields(original, {
      writeAllFields: false,
      pickField: () => 1,
      createFieldValue: () => "c".repeat(100),
    });

    assert.deepStrictEqual(original, {
      0: "a".repeat(100),
      1: "b".repeat(100),
    });
    assert.strictEqual(updated[0], "a".repeat(100));
    assert.strictEqual(updated[1], "c".repeat(100));
  });

  it("projectRead returns the selected field when readAllFields is false", () => {
    const record = {
      0: "a".repeat(100),
      1: "b".repeat(100),
    };

    const projected = projectRead(record, {
      readAllFields: false,
      pickField: () => 1,
    });

    assert.strictEqual(projected, "b".repeat(100));
  });
});
