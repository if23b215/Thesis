const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('test test', () => {
  it('test test ok', () => {
    assert.strictEqual(1 + 1, 2);
  });
});