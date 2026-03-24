const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createWorkload, getWorkloadMix } = require('../../src/domain/workloadGenerator');

describe('WorkloadGenerator', () => {
  ['A', 'B', 'C'].forEach(workloadName => {
    it(`workload ${workloadName} proportions within 1%`, () => {
      const generator = createWorkload({ workload: workloadName, recordCount: 1000, seed: 42n });
      const operations = Array.from({ length: 100000 }, () => generator());
      const reads = operations.filter(op => op.operation === 'READ').length;
      const updates = operations.filter(op => op.operation === 'UPDATE').length;
      const readProp = reads / operations.length;
      const updateProp = updates / operations.length;
      const target = getWorkloadMix(workloadName);
      assert(Math.abs(readProp - target.readProp) < 0.01);
      assert(Math.abs(updateProp - target.updateProp) < 0.01);
    });
  });
});