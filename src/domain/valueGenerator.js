"use strict";

const { XorShift128Plus } = require("./zipfianGenerator");

// Ascii characters 32 - 126 are printable, this avoids control characters
const ASCII_START = 32;
const ASCII_RANGE = 95;

function getFieldName(index) {
  return "field" + index;
}

function isRecord(record) {
  return record !== null && typeof record === "object" && !Array.isArray(record);
}

// YCSB-style ASCII value generator
// in:  size (bytes), deterministic seed
// out: function that returns a fixed-width string each call
function createValueGenerator(size = 100, seed = 1n) {
  const rng = new XorShift128Plus(BigInt(seed));

  return () => {
    // temporary byte array, used only to assemble the value, dies after
    // small enough (< 8 KB) to stay in heap memory
    // e.g. [0,0,0]
    const value = Buffer.allocUnsafe(size);

    // e.g. [34,45,56]
    for (let i = 0; i < size; i++) {
      value[i] = ASCII_START + Number(rng.nextU64() % BigInt(ASCII_RANGE));
    }

    // parses bytes to regular string
    // the byte array dies after
    // e.g. '"-8'
    return value.toString("latin1");
  };
}

// in:  fieldCount, fieldLength (bytes per field), seed
// out: function that returns { field0: str, field1: str, … } records
//        total record size = fieldCount × fieldLength bytes
function createRecordGenerator({
  fieldCount = 10,
  fieldLength = 100,
  seed = 11n,
} = {}) {
  if (!Number.isInteger(fieldCount) || fieldCount <= 0) {
    throw new Error("fieldCount must be a positive integer");
  }
  if (!Number.isInteger(fieldLength) || fieldLength <= 0) {
    throw new Error("fieldLength must be a positive integer");
  }

  const nextFieldValue = createValueGenerator(fieldLength, seed);

  return () => {
    const record = {};

    for (let i = 0; i < fieldCount; i++) {
      record[getFieldName(i)] = nextFieldValue();
    }

    return record;
  };
}

// in:  fieldCount, seed
// out: function that returns a random field index [0, fieldCount)
function createFieldPicker({ fieldCount = 10, seed = 21n } = {}) {
  if (!Number.isInteger(fieldCount) || fieldCount <= 0) {
    throw new Error("fieldCount must be a positive integer");
  }
  const rng = new XorShift128Plus(BigInt(seed));
  return () => Math.floor(rng.nextDouble() * fieldCount);
}

// in:  existing record, field picker, value factory
// out: new record with one updated field — original is not modified
function updateRecordFields(record, { pickField, createFieldValue }) {
  if (!isRecord(record)) return record;

  const nextRecord = { ...record };
  // existing record[0-9], random index, random new Value for one Field
  nextRecord[getFieldName(pickField())] = createFieldValue();
  return nextRecord;
}

module.exports = {
  createValueGenerator,
  createRecordGenerator,
  createFieldPicker,
  updateRecordFields,
};
