"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

describe("L4: No swap disks", () => {
  it("host has no swap disks configured", () => {
    const swaps = fs
      .readFileSync("/proc/swaps", "utf8")
      .trim()
      .split("\n")
      .slice(1)
      .filter(Boolean);

    assert.deepStrictEqual(swaps, []);
  });
});
