"use strict";

const Database = require("better-sqlite3");

const SCALAR_FIELD = "__bench_scalar__";

function isRecordValue(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toRows(value) {
  if (isRecordValue(value)) {
    return Object.entries(value).map(([field, fieldValue]) => [
      field,
      String(fieldValue),
    ]);
  }

  return [[SCALAR_FIELD, String(value)]];
}

function fromRows(rows) {
  if (rows.length === 0) return undefined;
  if (rows.length === 1 && rows[0].field === SCALAR_FIELD) {
    return rows[0].value;
  }

  const record = {};

  for (const row of rows) {
    record[row.field] = row.value;
  }

  return record;
}

function createSqliteStore({ filename = ":memory:" } = {}) {
  const db = new Database(filename);

  db.pragma("journal_mode = MEMORY");
  db.pragma("synchronous = OFF");
  db.pragma("temp_store = MEMORY");

  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT NOT NULL,
      field TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (key, field)
    ) WITHOUT ROWID
  `);

  const getStmt = db.prepare(
    "SELECT field, value FROM kv WHERE key = ? ORDER BY field",
  );
  const upsertStmt = db.prepare(`
    INSERT INTO kv (key, field, value)
    VALUES (?, ?, ?)
    ON CONFLICT(key, field) DO UPDATE SET value = excluded.value
  `);
  const deleteStmt = db.prepare("DELETE FROM kv WHERE key = ?");
  const hasStmt = db.prepare("SELECT 1 FROM kv WHERE key = ? LIMIT 1").pluck();
  const sizeStmt = db
    .prepare("SELECT COUNT(*) FROM (SELECT key FROM kv GROUP BY key)")
    .pluck();
  const clearStmt = db.prepare("DELETE FROM kv");
  const replaceStmt = db.transaction((key, value) => {
    deleteStmt.run(key);

    for (const [field, fieldValue] of toRows(value)) {
      upsertStmt.run(key, field, fieldValue);
    }
  });

  return {
    get(key) {
      return fromRows(getStmt.all(key));
    },
    set(key, value) {
      replaceStmt(key, value);
      return this;
    },
    delete(key) {
      return deleteStmt.run(key).changes > 0;
    },
    has(key) {
      return hasStmt.get(key) !== undefined;
    },
    size() {
      return sizeStmt.get();
    },
    clear() {
      clearStmt.run();
    },
    close() {
      db.close();
    },
  };
}

module.exports = { createSqliteStore };
