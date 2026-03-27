"use strict";

const { XorShift128Plus } = require("./zipfianGenerator");

// YCSB-style random bytes value generator
function createValueGenerator(size = 100, seed = 1n) {
  const rng = new XorShift128Plus(BigInt(seed));

  return () => {
    const buf = Buffer.allocUnsafe(size);
    let i = 0;

    while (i < size) {
      let x = rng.nextU64();
      for (let j = 0; j < 8 && i < size; j++) {
        buf[i++] = Number(x & 0xffn);
        x >>= 8n;
      }
    }

    return buf;
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
    const record = Buffer.allocUnsafe(fieldCount * fieldLength);
    for (let i = 0; i < fieldCount; i++) {
      nextFieldValue().copy(record, i * fieldLength);
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
  { writeAllFields, pickField, createFieldValue, fieldLength },
) {
  if (!Buffer.isBuffer(record)) return record;
  const nextRecord = Buffer.from(record);
  const fieldCount = Math.floor(nextRecord.length / fieldLength);
  if (writeAllFields) {
    for (let i = 0; i < fieldCount; i++) {
      createFieldValue().copy(nextRecord, i * fieldLength);
    }
    return nextRecord;
  }

  const fieldIndex = pickField();
  createFieldValue().copy(nextRecord, fieldIndex * fieldLength);
  return nextRecord;
}

function projectRead(record, { readAllFields, pickField, fieldLength }) {
  if (!Buffer.isBuffer(record)) return record;
  if (readAllFields) return record;
  const fieldIndex = pickField();
  const start = fieldIndex * fieldLength;
  const end = start + fieldLength;
  return record.subarray(start, end);
}

module.exports = {
  createValueGenerator,
  createRecordGenerator,
  createFieldPicker,
  updateRecordFields,
  projectRead,
};
