"use strict";

// YCSB-Style Zipfian + ScrambledZipfian generator

const U64_MASK = (1n << 64n) - 1n;

function splitmix64(seed) {
  let x = seed & U64_MASK;
  return function nextU64() {
    x = (x + 0x9e3779b97f4a7c15n) & U64_MASK;
    let z = x;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & U64_MASK;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & U64_MASK;
    return (z ^ (z >> 31n)) & U64_MASK;
  };
}

class XorShift128Plus {
  constructor(seed = 1n) {
    const sm = splitmix64(BigInt(seed));
    this.s0 = sm();
    this.s1 = sm();
  }

  nextU64() {
    let s1 = this.s0;
    const s0 = this.s1;
    this.s0 = s0;
    s1 ^= (s1 << 23n) & U64_MASK;
    s1 ^= s1 >> 17n;
    s1 ^= s0;
    s1 ^= s0 >> 26n;
    this.s1 = s1 & U64_MASK;
    return (this.s1 + s0) & U64_MASK;
  }

  nextDouble() {
    const x = this.nextU64() >> 11n;
    return Number(x) / 9007199254740992;
  }
}

const FNV_OFFSET_BASIS_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 1099511628211n;

function fnvhash64(val) {
  let hashval = FNV_OFFSET_BASIS_64;
  let v = BigInt(val) & U64_MASK;

  for (let i = 0; i < 8; i++) {
    const octet = v & 0xffn;
    v = v >> 8n;
    hashval = hashval ^ octet;
    hashval = (hashval * FNV_PRIME_64) & U64_MASK;
  }

  if (hashval >= 0x8000000000000000n) {
    hashval = (1n << 64n) - hashval;
  }

  return hashval;
}

// Zeta function

function zetastatic(n, theta, start = 1, initialSum = 0.0) {
  let sum = initialSum;
  for (let i = start; i <= n; i++) {
    sum += 1.0 / Math.pow(i, theta);
  }
  return sum;
}

// ZipfianGenerator
const ZIPFIAN_CONSTANT = 0.99;

class ZipfianGenerator {
  // @param {number} min - Smallest number
  // @param {number} max - Largest number
  // @param {number} zipfianconstant - Zipfian constant (default 0.99)
  // @param {XorShift128Plus} rng - Random number generator
  // @param {number|null} zetanPrecomputed - Precomputed zeta(n, theta), or null to compute
  constructor(
    min,
    max,
    zipfianconstant = ZIPFIAN_CONSTANT,
    rng = new XorShift128Plus(1n),
    zetanPrecomputed = null,
  ) {
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      throw new Error("min/max must be finite numbers");
    }
    if (max < min) throw new Error("max must be >= min");

    this.base = min;
    this.min = min;
    this.max = max;
    this.items = max - min + 1;
    this.zipfianconstant = zipfianconstant;
    this.theta = zipfianconstant;
    this.rng = rng;

    // Precompute constants
    this.zeta2theta = zetastatic(2, this.theta);

    if (zetanPrecomputed !== null) {
      this.zetan = zetanPrecomputed;
    } else {
      this.zetan = zetastatic(this.items, this.theta);
    }

    this.countforzeta = this.items;
    this.alpha = 1.0 / (1.0 - this.theta);
    this.eta =
      (1.0 - Math.pow(2.0 / this.items, 1.0 - this.theta)) /
      (1.0 - this.zeta2theta / this.zetan);

    this._lastValue = this.nextLong(this.items);
  }

  // Generate next value using given itemcount

  nextLong(itemcount) {
    const u = this.rng.nextDouble();
    const uz = u * this.zetan;

    if (uz < 1.0) {
      return this.base;
    }

    if (uz < 1.0 + Math.pow(0.5, this.theta)) {
      return this.base + 1;
    }

    let ret =
      this.base +
      Math.floor(
        itemcount * Math.pow(this.eta * u - this.eta + 1.0, this.alpha),
      );

    // Guard
    if (ret < this.base) ret = this.base;
    if (ret > this.base + itemcount - 1) ret = this.base + itemcount - 1;

    this._lastValue = ret;
    return ret;
  }

  nextValue() {
    return this.nextLong(this.items);
  }

  lastValue() {
    return this._lastValue;
  }
}

// ScrambledZipfianGenerator

const ITEM_COUNT = 10_000_000_000; // Default count for precomputed zeta

// Precomputed zeta
const ZETAN = 26.46902820178302;

class ScrambledZipfianGenerator {
  // @param {number} min - Smallest number
  // @param {number} max - Largest number
  // @param {number} zipfianconstant - Zipfian constant (default 0.99)
  // @param {XorShift128Plus} rng - Random number generator
  constructor(
    min,
    max,
    zipfianconstant = ZIPFIAN_CONSTANT,
    rng = new XorShift128Plus(1n),
  ) {
    this.min = min;
    this.max = max;
    this.itemcount = max - min + 1;

    // Use precomputed ZETAN only if default zipfian constant
    if (zipfianconstant === ZIPFIAN_CONSTANT) {
      this.gen = new ZipfianGenerator(
        0,
        ITEM_COUNT - 1,
        zipfianconstant,
        rng,
        ZETAN,
      );
    } else {
      // Non-default constant requires computing zeta
      this.gen = new ZipfianGenerator(
        0,
        ITEM_COUNT - 1,
        zipfianconstant,
        rng,
        null,
      );
    }
  }

  nextValue() {
    const zipfVal = this.gen.nextValue();

    const hashed = fnvhash64(zipfVal);
    const ret = this.min + Number(hashed % BigInt(this.itemcount));

    this._lastValue = ret;
    return ret;
  }

  lastValue() {
    return this._lastValue;
  }

  mean() {
    return (this.min + this.max) / 2.0;
  }
}

// Exports
module.exports = {
  // Generators
  ZipfianGenerator,
  ScrambledZipfianGenerator,
  XorShift128Plus,

  // Constants (for testing/verification)
  ZIPFIAN_CONSTANT,
  ITEM_COUNT,
  ZETAN,
  FNV_OFFSET_BASIS_64,
  FNV_PRIME_64,

  // Utilities
  fnvhash64,
  zetastatic,
};
