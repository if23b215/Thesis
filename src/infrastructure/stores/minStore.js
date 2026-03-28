const DEFAULT_MAX_PER_MAP = 5_000_000; // save maximum before we hit V8 limit (heap limit / map limit)

function createMinStore({ maxPerMap = DEFAULT_MAX_PER_MAP } = {}) {
  const maps = [new Map()];

  function getLastMap() {
    return maps[maps.length - 1];
  }

  function findMapIndexContainingKey(key) {
    // Search newest -> oldest
    for (let i = maps.length - 1; i >= 0; i--) {
      const m = maps[i];
      // Avoid double-hash when possible, while still supporting stored undefined values.
      const v = m.get(key);
      if (v !== undefined || m.has(key)) return i;
    }
    return -1;
  }

  return {
    get(key) {
      const i = findMapIndexContainingKey(key);
      return i === -1 ? undefined : maps[i].get(key);
    },

    set(key, value) {
      // If key already exists, update
      const i = findMapIndexContainingKey(key);
      if (i !== -1) {
        maps[i].set(key, value);
        return this;
      }

      // Insert into the newest shard, rollover if full
      let m = getLastMap();
      if (m.size >= maxPerMap) {
        m = new Map();
        maps.push(m);
      }

      try {
        m.set(key, value);
      } catch (e) {
        // If we hit the V8 Map max-size hard limit, start a new shard and retry once.
        if (
          e instanceof RangeError &&
          String(e.message).includes("Map maximum size exceeded")
        ) {
          const m2 = new Map();
          maps.push(m2);
          m2.set(key, value);
        } else {
          throw e;
        }
      }

      return this;
    },

    delete(key) {
      // Delete first match
      for (let i = maps.length - 1; i >= 0; i--) {
        if (maps[i].delete(key)) return true;
      }
      return false;
    },

    has(key) {
      return findMapIndexContainingKey(key) !== -1;
    },
    shardCount() {
      return maps.length;
    },
    shards() {
      return maps; // func for debugging
    },
    size() {
      let total = 0;
      for (const m of maps) total += m.size;
      return total;
    },
    clear() {
      maps.length = 1;
      maps[0] = new Map();
    },
    close() {
      maps.length = 1;
      maps[0] = new Map();
    },
  };
}

module.exports = { createMinStore, DEFAULT_MAX_PER_MAP };
