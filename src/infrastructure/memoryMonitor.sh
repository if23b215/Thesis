#!/usr/bin/env bash
# Exit on error, unset vars, and failed pipes
set -euo pipefail

# Sample every 10 ms
SAMPLE_INTERVAL_SEC="0.01"
STORE_NAME="${1:-}"
NODE_EXECUTION_COMMAND=(node --trace-gc --trace-gc-ignore-scavenger src/presentation/runner.js)

# Check if Redis
is_redis_store() {
  [[ "${STORE_NAME,,}" == *redis* ]]
}

# Read RSS memory
read_rss_kib() {
  # Use first arg parsed, if empty use empty strig
  local pid="${1:-}"
  # pid ===  '' ? 0 
  if [[ -z "$pid" ]]; then
    echo 0
    return
  fi
  # Reads VmRSS second field / if not found use 0
  awk '/VmRSS:/{print $2; found=1; exit} END{if(!found) print 0}' "/proc/$pid/status" 2>/dev/null || echo 0
}

# Finds Redis PID
# Gets all PIDS with the name "reddis-server" | select the first || lets the script continue on fail
detect_redis_pid() {
  pgrep -f "redis-server" | head -n1 || true
}

# KiB to MiB
# awk script, first arg of the func call is saved to kib -> prints kib/1024 up to 3 dec 0.000 
to_mib() {
  awk -v kib="$1" 'BEGIN{printf "%.3f", kib/1024}'
}

# FIFO: Pipe that gets the node output
fifo="$(mktemp -u)"
state_file="$(mktemp)"
mkfifo "$fifo"
echo "waiting" >"$state_file"

# Temp files cleanup
cleanup() {
  rm -f "$fifo" "$state_file"
}
trap cleanup EXIT

# Runs Benchmark
# & => start in background, $! => PID of most recent background start
"${NODE_EXECUTION_COMMAND[@]}" "$@" >"$fifo" 2>&1 &
NODE_PID=$!

# Changes Phase (load -> warmup -> benchmark ->results), based on output
{
  while IFS= read -r line; do
    printf '%s\n' "$line"
    case "$line" in
      *"----- YCSB Workload "*) echo "load" >"$state_file" ;;
      *"Warming up ("*) echo "warmup" >"$state_file" ;;
      *"Running benchmark ("*) echo "benchmark" >"$state_file" ;;
      *"--- Results ---"*) echo "results" >"$state_file" ;;
    esac
  done <"$fifo"
} &
READER_PID=$!

REDIS_PID=""
if is_redis_store; then
  REDIS_PID="$(detect_redis_pid || true)"
fi

# Memory colletion vars
RSS_PRE_LOAD_KIB=""
RSS_POST_LOAD_KIB=""
RSS_END_KIB=0
LAST_NONZERO_TOTAL_KIB=0
BENCHMARK_SAMPLES=()

# Poll memory usage while node process is alive
while kill -0 "$NODE_PID" 2>/dev/null; do
  NODE_RSS_KIB="$(read_rss_kib "$NODE_PID")"
  REDIS_RSS_KIB=0
  if is_redis_store; then
    if [[ -z "${REDIS_PID}" ]]; then
      REDIS_PID="$(detect_redis_pid || true)"
    fi
    REDIS_RSS_KIB="$(read_rss_kib "$REDIS_PID")"
  fi

  # Total memory is Node (+ Redis) 
  TOTAL_RSS_KIB=$((NODE_RSS_KIB + REDIS_RSS_KIB))
  RSS_END_KIB="$TOTAL_RSS_KIB"
  if ((TOTAL_RSS_KIB > 0)); then
    LAST_NONZERO_TOTAL_KIB="$TOTAL_RSS_KIB"
  fi

  PHASE="$(cat "$state_file")"

  # First sample during "load" (triggered by the workload banner) becomes pre-load memory.
  if [[ -z "$RSS_PRE_LOAD_KIB" && "$PHASE" == "load" ]]; then
    RSS_PRE_LOAD_KIB="$TOTAL_RSS_KIB"
  fi

  # First sample in warmup is the first sample after load.
  if [[ -z "$RSS_POST_LOAD_KIB" && "$PHASE" == "warmup" ]]; then
    RSS_POST_LOAD_KIB="$TOTAL_RSS_KIB"
  fi

  # Only collect benchmark samples during the benchmark phase.
  if [[ "$PHASE" == "benchmark" ]]; then
    BENCHMARK_SAMPLES+=("$TOTAL_RSS_KIB")
  fi

  sleep "$SAMPLE_INTERVAL_SEC"
done

# Wait for the benchmark and preserve its exit code.
# $? exit status of command before
BENCH_EXIT=0
wait "$NODE_PID" || BENCH_EXIT=$?
wait "$READER_PID" || true

# If the final sample was zero, use the last non-zero value seen.
if ((RSS_END_KIB == 0 && LAST_NONZERO_TOTAL_KIB > 0)); then
  RSS_END_KIB="$LAST_NONZERO_TOTAL_KIB"
fi

# Compute peak and median memory during the benchmark phase.
if ((${#BENCHMARK_SAMPLES[@]} > 0)); then
  RSS_PEAK_KIB="$(printf '%s\n' "${BENCHMARK_SAMPLES[@]}" | sort -n | tail -n1)"
  RSS_MEDIAN_KIB="$(
    printf '%s\n' "${BENCHMARK_SAMPLES[@]}" | sort -n | awk '
      {a[NR]=$1}
      END{
        if (NR==0) { print 0; exit }
        if (NR%2==1) { print a[(NR+1)/2]; exit }
        print (a[NR/2]+a[NR/2+1])/2
      }
    '
  )"
else
  RSS_PEAK_KIB="$RSS_END_KIB"
  RSS_MEDIAN_KIB="$RSS_END_KIB"
fi

# Print memory summary in MiB.
printf '\nMemory stats (MiB)\n'
printf 'RSS_pre_load: %s\n' "$(to_mib "$RSS_PRE_LOAD_KIB")"
printf 'RSS_post_load: %s\n' "$(to_mib "$RSS_POST_LOAD_KIB")"
printf 'RSS_peak_during_benchmark: %s\n' "$(to_mib "$RSS_PEAK_KIB")"
printf 'RSS_median_during_benchmark: %s\n' "$(to_mib "$RSS_MEDIAN_KIB")"
printf 'RSS_end: %s\n' "$(to_mib "$RSS_END_KIB")"

RSS_PRE_LOAD_MIB="$(to_mib "$RSS_PRE_LOAD_KIB")"
RSS_POST_LOAD_MIB="$(to_mib "$RSS_POST_LOAD_KIB")"
RSS_PEAK_MIB="$(to_mib "$RSS_PEAK_KIB")"
RSS_MEDIAN_MIB="$(to_mib "$RSS_MEDIAN_KIB")"
RSS_END_MIB="$(to_mib "$RSS_END_KIB")"

RESULTS_JSON_PATH="logs/${STORE_NAME:-map}-benchmark-results.json"

# If the benchmark succeeded, write memory stats into the results JSON.
if [[ "$BENCH_EXIT" -eq 0 && -f "$RESULTS_JSON_PATH" ]]; then
  node -e 'const fs=require("node:fs");const p=process.argv[1];const m={RSS_pre_load:Number(process.argv[2]),RSS_post_load:Number(process.argv[3]),RSS_peak_during_benchmark:Number(process.argv[4]),RSS_median_during_benchmark:Number(process.argv[5]),RSS_end:Number(process.argv[6])};const d=JSON.parse(fs.readFileSync(p,"utf8"));(Array.isArray(d)?d:[d]).forEach((x)=>{if(x&&typeof x==="object")x.memory=m;});fs.writeFileSync(p,JSON.stringify(d,null,2)+"\n","utf8");' "$RESULTS_JSON_PATH" "$RSS_PRE_LOAD_MIB" "$RSS_POST_LOAD_MIB" "$RSS_PEAK_MIB" "$RSS_MEDIAN_MIB" "$RSS_END_MIB"
fi

exit "$BENCH_EXIT"
