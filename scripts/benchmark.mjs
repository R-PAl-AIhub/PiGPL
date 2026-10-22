/**
 * Compiler benchmark: time and memory for the whole PiGPL pipeline.
 *
 *   npm run bench
 *
 * Each scenario compiles one generated program several times. The table shows
 * the median time, the memory that the result keeps alive, the size of the
 * pipeline output, and whether the program compiled and ran without errors.
 * Run with `--expose-gc` (the npm script does this) for exact memory numbers.
 */
import { compile } from "../src/compiler/index.ts";

const RUNS = 7;
const WARMUP = 2;

const lines = (n, make) => Array.from({ length: n }, (_, i) => make(i)).join("\n");

const SCENARIOS = [
  ["100 declarations", `${lines(100, (i) => `let v${i}: int = ${i} + 1`)}\nprint(v99)\n`],
  ["1,000 declarations", `${lines(1000, (i) => `let v${i}: int = ${i} + 1`)}\nprint(v999)\n`],
  ["5,000 declarations", `${lines(5000, (i) => `let v${i}: int = ${i} + 1`)}\nprint(v4999)\n`],
  ["expression of 500 terms", `print(${Array(500).fill("1").join(" + ")})\n`],
  ["expression of 1,000 terms", `print(${Array(1000).fill("1").join(" + ")})\n`],
  ["loop: sum of 1,000 numbers", "let s: int = 0\nfor i in 1000 {\n    s = s + i\n}\nprint(s)\n"],
  ["loop: sum of 100,000 numbers", "let s: int = 0\nfor i in 100000 {\n    s = s + i\n}\nprint(s)\n"],
  [
    "recursion: fib(10)",
    "fn fib(n: int) -> int {\n    if n < 2 {\n        return n\n    }\n    return fib(n - 1) + fib(n - 2)\n}\nprint(fib(10))\n",
  ],
  [
    "recursion: fib(20)",
    "fn fib(n: int) -> int {\n    if n < 2 {\n        return n\n    }\n    return fib(n - 1) + fib(n - 2)\n}\nprint(fib(20))\n",
  ],
  [
    "recursion: fib(27)",
    "fn fib(n: int) -> int {\n    if n < 2 {\n        return n\n    }\n    return fib(n - 1) + fib(n - 2)\n}\nprint(fib(27))\n",
  ],
  ["endless loop (stopped by the step limit)", "while true {\n}\n"],
  [
    "list: 300 items, sum",
    `let xs: list = [${Array.from({ length: 300 }, (_, i) => i).join(", ")}]\nlet s: int = 0\nfor v in xs {\n    s = s + v\n}\nprint(s)\n`,
  ],
  ["output: 5,000 print lines", "for i in 5000 {\n    print(i)\n}\n"],
];

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
// One collection can leave young-generation garbage behind, which makes small
// results read as negative memory. Three passes give a stable reading.
const gc = () => {
  for (let i = 0; i < 3; i++) globalThis.gc?.();
};
const heapMb = () => process.memoryUsage().heapUsed / 1048576;

function status(r) {
  const err = r.errors[0];
  return err ? `${err.phase}: ${err.message}`.slice(0, 60) : "ok";
}

const rows = [];
for (const [name, source] of SCENARIOS) {
  for (let i = 0; i < WARMUP; i++) compile(source);
  const times = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    compile(source);
    times.push(performance.now() - t0);
  }
  gc();
  const before = heapMb();
  const kept = compile(source);
  gc();
  // `kept` is read after the second gc() so the result stays alive during it.
  const retained = Math.max(0, heapMb() - before);
  if (kept.source !== source) throw new Error("benchmark result lost");
  rows.push({
    name,
    chars: source.length,
    ms: median(times),
    mb: retained,
    events: kept.events.length,
    tac: `${kept.ir.length}→${kept.optimizedIr.length}`,
    status: status(kept),
  });
}

const w = Math.max(...rows.map((r) => r.name.length));
console.log(`PiGPL compiler benchmark (median of ${RUNS} runs, Node ${process.version})`);
if (!globalThis.gc) console.log("Note: run with --expose-gc for exact memory numbers.");
console.log(
  `${"scenario".padEnd(w)}  ${"chars".padStart(7)}  ${"ms".padStart(8)}  ${"MB kept".padStart(8)}  ${"events".padStart(8)}  ${"TAC".padStart(11)}  status`,
);
for (const r of rows) {
  console.log(
    `${r.name.padEnd(w)}  ${String(r.chars).padStart(7)}  ${r.ms.toFixed(1).padStart(8)}  ${r.mb.toFixed(1).padStart(8)}  ${String(r.events).padStart(8)}  ${r.tac.padStart(11)}  ${r.status}`,
  );
}
