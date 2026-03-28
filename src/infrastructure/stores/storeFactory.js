"use strict";

// Ensures libs aren't loaded if the current store doesn't use them.
function lazyFactory(modulePath, exportName) {
  return (options) => require(modulePath)[exportName](options);
}

// Singular Map Store
function createMapStore() {
  const data = new Map();
  return {
    get: (key) => data.get(key),
    set: (key, value) => data.set(key, value),
    has: (key) => data.has(key),
    clear: () => data.clear(),
    close: () => data.clear(),
    size: () => data.size,
  };
}

const storeFactories = new Map();

function registerStore(name, factory) {
  if (!name) throw new Error("Store name is missing");
  if (typeof factory !== "function") throw new Error("Factory isnt a function");
  if (storeFactories.has(name))
    throw new Error(`Store "${name}" already exists`);
  storeFactories.set(name, factory);
}

function getStoreFactory(name) {
  return storeFactories.get(name);
}

registerStore("map", createMapStore);
registerStore("minStore", lazyFactory("./minStore", "createMinStore"));
registerStore("redisStore", lazyFactory("./redisStore", "createRedisStore"));
registerStore("sqliteStore", lazyFactory("./sqliteStore", "createSqliteStore"));

module.exports = { registerStore, getStoreFactory, storeFactories };
