# Thesis

A thesis project implementing a custom version of the Yahoo! Cloud Serving Benchmark (YCSB) for benchmarking cloud serving systems.

## Credits

This project is inspired by and builds upon the original YCSB framework developed by Yahoo! Research. The original YCSB can be found at [https://github.com/brianfrankcooper/YCSB](https://github.com/brianfrankcooper/YCSB).

## Installation

```bash
npm install
```

## Usage

Run the benchmark with the default setup:

```bash
npm start
```

Run the benchmark against a specific store:

```bash
npm start -- map
npm start -- minStore
npm start -- sqliteStore
npm start -- redisStore
```

Available stores are `map`, `minStore`, `sqliteStore`, and `redisStore`.

`redisStore` expects a Redis server to be active. You can override the connection settings with `BENCH_REDIS_HOST`, `BENCH_REDIS_PORT`, and `BENCH_REDIS_DB`. The defaults are `127.0.0.1`, `6379`, and `15`.

Each run writes benchmark results to `logs/<store>-benchmark-results.json`.

The log and memory runs accept the same optional store argument:

```bash
npm run log -- map
npm run memory -- map
```

`npm run log -- <store>` a run with GC log collection, writes outputs to `logs/gc-trace.log`.

`npm run memory -- <store>` a run with memory statistic and GC log collection, writes outputs to `logs/memory-gc-trace.log` and adds memory statistics to `logs/<store>-benchmark-results.json`.

## Testing

`npm test` runs Level 1 and Level 2 test suites.

```bash
npm test
```

Level 3 and Level 4 tests are manual and are not included in `npm test`.
