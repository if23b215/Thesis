const { ScrambledZipfianGenerator, XorShift128Plus } = require('./zipfianGenerator');

// YCSB-style workload
const WORKLOADS = {
  A: { readProp: 0.5, updateProp: 0.5 },
  B: { readProp: 0.95, updateProp: 0.05 },
  C: { readProp: 1.0, updateProp: 0.0 }
};

function registerWorkload(name, { readProp, updateProp } = {}) {
  if (!name) throw new Error('workload name is required');
  if (WORKLOADS[name]) throw new Error(`Workload "${name}" already exists`);
  if (!Number.isFinite(readProp)) throw new Error('readProp must be a number');
  if (!Number.isFinite(updateProp)) updateProp = 1 - readProp;
  WORKLOADS[name] = { readProp, updateProp };
}

function getWorkloadMix(name) {
  return WORKLOADS[name];
}

function createKeySelector({ recordCount, requestDistribution, rng, theta }) {
  if (requestDistribution === 'uniform') {
    return () => Math.floor(rng.nextDouble() * recordCount);
  }
  if (requestDistribution === 'zipfian') {
    const keyGen = new ScrambledZipfianGenerator(0, recordCount - 1, theta, rng);
    return () => keyGen.nextValue();
  }
  throw new Error(`Unsupported requestDistribution "${requestDistribution}". Expected "zipfian" or "uniform".`);
}


// Creates { key, operation } tuples.
// Keys are Scrambled Zipfian distributed.

function createWorkload({
  workload = 'A',
  recordCount,
  seed = 42n,
  theta = 0.99,
  requestDistribution = 'zipfian'
} = {}) {
  if (!recordCount || recordCount <= 0) {
    throw new Error('recordCount must be a positive integer');
  }

  const mix = getWorkloadMix(workload);
  if (!mix) {
    throw new Error(`Unknown workload "${workload}". Expected one of ${Object.keys(WORKLOADS).join(', ')}`);
  }

  const rng = new XorShift128Plus(BigInt(seed));
  const selectKey = createKeySelector({ recordCount, requestDistribution, rng, theta });

  return () => {
    const key = `key${selectKey()}`;
    const isRead = rng.nextDouble() < mix.readProp;
    return { key, operation: isRead ? 'READ' : 'UPDATE' };
  };
}

module.exports = { createWorkload, registerWorkload, getWorkloadMix, WORKLOADS };
