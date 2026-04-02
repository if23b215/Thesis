"use strict";

const { XorShift128Plus } = require("./zipfianGenerator");

const ASCII_START = 32;
const ASCII_RANGE = 95;

function getFieldName(index) {
  return String(index);
}

function isRecord(record) {
  return record !== null && typeof record === "object" && !Array.isArray(record);
}

// YCSB-style fixed-width printable ASCII value generator
function createValueGenerator(size = 100, seed = 1n) {
  const rng = new XorShift128Plus(BigInt(seed));

  return () => {
    const value = Buffer.allocUnsafe(size);

    for (let i = 0; i < size; i++) {
      value[i] = ASCII_START + Number(rng.nextU64() % BigInt(ASCII_RANGE));
    }

    return value.toString("latin1");
  };
}

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

function createFieldPicker({ fieldCount = 10, seed = 21n } = {}) {
  if (!Number.isInteger(fieldCount) || fieldCount <= 0) {
    throw new Error("fieldCount must be a positive integer");
  }
  const rng = new XorShift128Plus(BigInt(seed));
  return () => Math.floor(rng.nextDouble() * fieldCount);
}

function updateRecordFields(
  record,
  { writeAllFields, pickField, createFieldValue },
) {
  if (!isRecord(record)) return record;

  const nextRecord = { ...record };
  const fieldNames = Object.keys(nextRecord);

  if (fieldNames.length === 0) return nextRecord;

  if (writeAllFields) {
    for (const fieldName of fieldNames) {
      nextRecord[fieldName] = createFieldValue();
    }

    return nextRecord;
  }

  nextRecord[getFieldName(pickField())] = createFieldValue();
  return nextRecord;
}

function projectRead(record, { readAllFields, pickField }) {
  if (!isRecord(record)) return record;
  if (readAllFields) return record;

  return record[getFieldName(pickField())];
}

module.exports = {
  createValueGenerator,
  createRecordGenerator,
  createFieldPicker,
  updateRecordFields,
  projectRead,
};
