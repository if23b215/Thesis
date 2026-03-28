"use strict";

const Database = require("better-sqlite3");

function createSqliteStore({ filename = ":memory:" } = {}) {
  const db = new Database(filename);

  db.pragma("journal_mode = MEMORY");
  db.pragma("synchronous = OFF");
  db.pragma("temp_store = MEMORY");

  db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value BLOB
    ) WITHOUT ROWID
  `);

  const getStmt = db.prepare("SELECT value FROM kv WHERE key = ?").pluck();
  const upsertStmt = db.prepare(`
    INSERT INTO kv (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  const deleteStmt = db.prepare("DELETE FROM kv WHERE key = ?");
  const hasStmt = db.prepare("SELECT 1 FROM kv WHERE key = ? LIMIT 1").pluck();
  const sizeStmt = db.prepare("SELECT COUNT(*) FROM kv").pluck();
  const clearStmt = db.prepare("DELETE FROM kv");

  return {
    get(key) {
      return getStmt.get(key);
    },
    set(key, value) {
      upsertStmt.run(key, value);
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
