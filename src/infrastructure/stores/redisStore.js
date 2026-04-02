"use strict";

const { randomUUID } = require("crypto");
const { createClient } = require("redis");

const DEFAULT_HOST = process.env.BENCH_REDIS_HOST || "127.0.0.1";
const DEFAULT_PORT = Number(process.env.BENCH_REDIS_PORT || 6379);
const DEFAULT_DB = Number(process.env.BENCH_REDIS_DB || 15);
const SCAN_BATCH_SIZE = 2048;
const SCALAR_FIELD = "__bench_scalar__";

const NOOP = () => {};

function isRecordValue(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toRedisHash(value) {
  if (isRecordValue(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([field, fieldValue]) => [
        field,
        String(fieldValue),
      ]),
    );
  }

  return { [SCALAR_FIELD]: String(value) };
}

function fromRedisHash(hash) {
  const fields = Object.keys(hash);

  if (fields.length === 0) return undefined;
  if (fields.length === 1 && fields[0] === SCALAR_FIELD) {
    return hash[SCALAR_FIELD];
  }

  return hash;
}

async function countKeys(client, pattern) {
  let cursor = "0";
  let count = 0;

  do {
    const reply = await client.scan(cursor, {
      MATCH: pattern,
      COUNT: SCAN_BATCH_SIZE,
    });

    cursor = String(reply.cursor);
    count += reply.keys.length;
  } while (cursor !== "0");

  return count;
}

async function deleteKeys(client, pattern) {
  let cursor = "0";

  do {
    const reply = await client.scan(cursor, {
      MATCH: pattern,
      COUNT: SCAN_BATCH_SIZE,
    });

    cursor = String(reply.cursor);

    if (reply.keys.length !== 0) {
      await client.sendCommand(["UNLINK", ...reply.keys]);
    }
  } while (cursor !== "0");
}

async function createRedisStore({
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
  db = DEFAULT_DB,
} = {}) {
  const keyPrefix = `ba:bench:${process.pid}:${randomUUID()}:`;
  const keyPattern = `${keyPrefix}*`;

  const client = createClient({
    socket: {
      host,
      port,
      connectTimeout: 2000,
      reconnectStrategy: false,
    },
    database: db,
  });

  client.on("error", NOOP);

  await client.connect();

  function fullKey(key) {
    return keyPrefix + key;
  }

  return {
    isAsync: true,

    async get(key) {
      return fromRedisHash(await client.hGetAll(fullKey(key)));
    },

    async set(key, value) {
      const redisKey = fullKey(key);
      await client.del(redisKey);
      await client.hSet(redisKey, toRedisHash(value));
      return this;
    },

    async delete(key) {
      return (await client.sendCommand(["UNLINK", fullKey(key)])) === 1;
    },

    async has(key) {
      return (await client.exists(fullKey(key))) === 1;
    },

    async size() {
      return countKeys(client, keyPattern);
    },

    async clear() {
      await deleteKeys(client, keyPattern);
    },

    async close() {
      try {
        await deleteKeys(client, keyPattern);
      } finally {
        if (typeof client.close === "function") {
          await client.close();
        } else {
          client.destroy();
        }
      }
    },
  };
}

module.exports = { createRedisStore };
