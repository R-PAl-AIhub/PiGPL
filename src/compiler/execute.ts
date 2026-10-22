import type { CompilerError, ExecutionResult, ExecStep, Quad } from "./types.ts";

type Value = number | string | boolean | Value[];

/**
 * Most TAC instructions one run may execute. The executor runs 20 to 60 million steps per
 * second (measured with `npm run bench`), so a loop that never ends stops in about half a second.
 * It runs on the browser's main thread, so this limit also bounds how long the page can freeze.
 */
export const MAX_STEPS = 10_000_000;
/** Deepest chain of function calls. */
export const MAX_CALL_DEPTH = 1000;
/** Most lines a program may print. Each line becomes one event in the replay. */
export const MAX_OUTPUT_LINES = 10_000;
/** The recorded trace keeps the first steps and every print, so a long run does not fill memory. */
const MAX_TRACE_STEPS = 5_000;

interface FuncInfo {
  start: number;
  params: string[];
}

interface Frame {
  locals: Map<string, Value>;
  returnDest: string | null;
  returnIp: number;
}

/** A run-time error with a plain-language message. It is caught once, in execute(). */
class RuntimeFault extends Error {}

function fault(message: string): never {
  throw new RuntimeFault(message);
}

function parseValue(raw: string | null): Value | undefined {
  if (raw === null) return undefined;
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?\d+$/.test(raw)) return Number(raw);
  if (/^-?\d+\.\d+$/.test(raw)) return Number(raw);
  if (raw.startsWith('"') && raw.endsWith('"')) {
    try {
      return JSON.parse(raw) as string;
    } catch {
      return raw.slice(1, -1);
    }
  }
  return undefined;
}

function display(v: Value): string {
  if (Array.isArray(v)) return `[${v.map(display).join(", ")}]`;
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

function truthy(v: Value): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.length > 0;
  return v.length > 0;
}

/** The type name used in run-time error messages. */
function kindOf(v: Value): string {
  if (Array.isArray(v)) return "list";
  if (typeof v === "boolean") return "bool";
  return typeof v === "number" ? "number" : "string";
}

/** Equal by content: two lists are equal when their items are. */
function equal(a: Value, b: Value): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!equal(a[i]!, b[i]!)) return false;
    return true;
  }
  return a === b;
}

function notNumbers(op: string, a: Value, b: Value): never {
  return fault(`Operator '${op}' requires numeric operands, found ${kindOf(a)} and ${kindOf(b)}`);
}

/** An int result must stay exact. Past this range a number silently loses digits. */
function exactInt(result: number, exact: boolean): number {
  if (exact && !Number.isSafeInteger(result)) {
    fault(
      `Integer overflow: the result does not fit in an int (the largest int is ${Number.MAX_SAFE_INTEGER})`,
    );
  }
  return result;
}

function bin(op: string, a: Value, b: Value, exact: boolean): Value {
  switch (op) {
    case "+":
      if (typeof a === "number" && typeof b === "number") return exactInt(a + b, exact);
      if (typeof a === "string" && typeof b === "string") return a + b;
      return fault(
        `Operator '+' needs two numbers or two strings, found ${kindOf(a)} and ${kindOf(b)}`,
      );
    case "-":
      if (typeof a === "number" && typeof b === "number") return exactInt(a - b, exact);
      return notNumbers(op, a, b);
    case "*":
      if (typeof a === "number" && typeof b === "number") return exactInt(a * b, exact);
      return notNumbers(op, a, b);
    case "/":
    case "//":
    case "%": {
      if (typeof a !== "number" || typeof b !== "number") return notNumbers(op, a, b);
      if (b === 0) return fault("Division by zero");
      if (op === "/") return a / b;
      return op === "//" ? Math.trunc(a / b) : a % b;
    }
    case "==":
      return equal(a, b);
    case "!=":
      return !equal(a, b);
    case "<":
    case ">":
    case "<=":
    case ">=": {
      if (typeof a !== "number" || typeof b !== "number") return notNumbers(op, a, b);
      if (op === "<") return a < b;
      if (op === ">") return a > b;
      return op === "<=" ? a <= b : a >= b;
    }
    case "and":
      return truthy(a) && truthy(b);
    case "or":
      return truthy(a) || truthy(b);
    default:
      return 0;
  }
}

/** Check an index against a list or string and return it, or stop with a message that says what is valid. */
function checkedIndex(container: Value[] | string, raw: Value, what: "List" | "String"): number {
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    fault(`${what} index ${display(raw)} must be a whole number`);
  }
  const n = container.length;
  if (raw < 0 || raw >= n) {
    const noun = what === "List" ? "item" : "character";
    fault(
      n === 0
        ? `${what} index ${raw} is out of range. The ${what.toLowerCase()} is empty.`
        : `${what} index ${raw} is out of range. The ${what.toLowerCase()} has ${n} ${noun}${n === 1 ? "" : "s"}, so valid indexes are 0 to ${n - 1}.`,
    );
  }
  return raw;
}

export function execute(quads: Quad[]): ExecutionResult {
  const output: string[] = [];
  const steps: ExecStep[] = [];
  const funcs = new Map<string, FuncInfo>();
  const labels = new Map<string, number>();
  // Constant operands never change, so they are parsed once here, not on every step.
  const lit1: (Value | undefined)[] = new Array(quads.length);
  const lit2: (Value | undefined)[] = new Array(quads.length);

  for (let i = 0; i < quads.length; i++) {
    const q = quads[i]!;
    lit1[i] = parseValue(q.arg1);
    lit2[i] = parseValue(q.arg2);
    if (q.op === "label" && q.result) labels.set(q.result, i);
    if (q.op === "func" && q.result) {
      funcs.set(q.result, {
        start: i + 1,
        params: q.arg1 ? q.arg1.split(",").filter(Boolean) : [],
      });
    }
  }

  const main = funcs.get("main");
  if (!main) {
    return {
      output,
      steps,
      halted: true,
      error: {
        phase: "Runtime",
        message: "No main function in IR",
        line: 0,
        column: 0,
      },
    };
  }

  let ip = main.start;
  // A function sees its own frame and the global frame (the main program's), never its caller's.
  const globals = new Map<string, Value>();
  const stack: Frame[] = [{ locals: globals, returnDest: null, returnIp: -1 }];
  const argStack: Value[] = [];
  let stepsCount = 0;

  const lookup = (name: string): Value => {
    const local = stack[stack.length - 1]!.locals.get(name);
    if (local !== undefined) return local;
    return globals.get(name) ?? 0;
  };

  /** A value from an operand that may be a constant or a name (used for the less common operands). */
  const resolve = (raw: string | null): Value => {
    if (raw === null) return 0;
    const lit = parseValue(raw);
    return lit !== undefined ? lit : lookup(raw);
  };

  const get1 = (i: number): Value => {
    const lit = lit1[i];
    if (lit !== undefined) return lit;
    const raw = quads[i]!.arg1;
    return raw === null ? 0 : lookup(raw);
  };

  const get2 = (i: number): Value => {
    const lit = lit2[i];
    if (lit !== undefined) return lit;
    const raw = quads[i]!.arg2;
    return raw === null ? 0 : lookup(raw);
  };

  const setLocal = (name: string, value: Value) => {
    stack[stack.length - 1]!.locals.set(name, value);
  };

  /** Update the variable that owns `name`: this frame's own, otherwise the global one. */
  const store = (name: string, value: Value) => {
    const top = stack[stack.length - 1]!.locals;
    if (!top.has(name) && globals.has(name)) globals.set(name, value);
    else top.set(name, value);
  };

  const fail = (message: string, line = 0): ExecutionResult => ({
    output,
    steps,
    halted: true,
    error: { phase: "Runtime", message, line, column: 0 },
  });

  try {
    while (ip >= 0 && ip < quads.length) {
      if (++stepsCount > MAX_STEPS) {
        const err: CompilerError = {
          phase: "Runtime",
          message: `Execution stopped after ${MAX_STEPS.toLocaleString("en-US")} steps (possible infinite loop)`,
          line: 0,
          column: 0,
        };
        return { output, steps, halted: true, error: err };
      }
      const q = quads[ip]!;
      if (q.op === "func") {
        ip += 1;
        continue;
      }
      if (q.op === "endfunc") {
        const frame = stack.pop();
        if (!frame || stack.length === 0) break;
        ip = frame.returnIp;
        continue;
      }
      if (q.op === "label") {
        ip += 1;
        continue;
      }

      if (steps.length < MAX_TRACE_STEPS) steps.push({ ip, text: q.text });

      switch (q.op) {
        case "=": {
          if (q.result) {
            const mode = q.args?.[0];
            if (mode === "assign") store(q.result, get1(ip));
            else setLocal(q.result, get1(ip));
          }
          ip += 1;
          break;
        }
        case "neg": {
          const v = get1(ip);
          if (typeof v !== "number") fault(`Unary '-' requires a numeric operand, found ${kindOf(v)}`);
          if (q.result) setLocal(q.result, -v);
          ip += 1;
          break;
        }
        case "not": {
          if (q.result) setLocal(q.result, !truthy(get1(ip)));
          ip += 1;
          break;
        }
        case "+":
        case "-":
        case "*":
        case "/":
        case "//":
        case "%":
        case "==":
        case "!=":
        case "<":
        case ">":
        case "<=":
        case ">=":
        case "and":
        case "or": {
          const value = bin(q.op, get1(ip), get2(ip), q.args?.[0] === "int");
          if (q.result) setLocal(q.result, value);
          ip += 1;
          break;
        }
        case "print": {
          const v = display(get1(ip));
          if (output.length >= MAX_OUTPUT_LINES) {
            fault(
              `Output limit of ${MAX_OUTPUT_LINES.toLocaleString("en-US")} lines reached. The program prints too much; look for a loop that never ends.`,
            );
          }
          output.push(v);
          // The print is the last recorded step when it was recorded at all; otherwise record it now.
          const last = steps[steps.length - 1];
          if (last && last.ip === ip && last.output === undefined) last.output = v;
          else steps.push({ ip, text: q.text, output: v });
          ip += 1;
          break;
        }
        case "goto": {
          const t = q.arg1 ? labels.get(q.arg1) : undefined;
          if (t === undefined) return fail(`Unknown label ${q.arg1}`, q.srcLine);
          ip = t;
          break;
        }
        case "ifFalse": {
          if (!truthy(get1(ip))) {
            const t = q.arg2 ? labels.get(q.arg2) : undefined;
            if (t === undefined) return fail(`Unknown label ${q.arg2}`, q.srcLine);
            ip = t;
          } else {
            ip += 1;
          }
          break;
        }
        case "ifTrue": {
          if (truthy(get1(ip))) {
            const t = q.arg2 ? labels.get(q.arg2) : undefined;
            if (t === undefined) return fail(`Unknown label ${q.arg2}`, q.srcLine);
            ip = t;
          } else {
            ip += 1;
          }
          break;
        }
        case "param": {
          argStack.push(get1(ip));
          ip += 1;
          break;
        }
        case "call": {
          const fname = q.arg1 ?? "";
          const n = Number(q.arg2 ?? 0);
          const fn = funcs.get(fname);
          if (!fn) return fail(`Unknown function ${fname}`, q.srcLine);
          if (stack.length - 1 >= MAX_CALL_DEPTH) {
            fault(
              `Maximum call depth of ${MAX_CALL_DEPTH.toLocaleString("en-US")} exceeded. A function probably calls itself without stopping.`,
            );
          }
          const args = argStack.splice(argStack.length - n, n);
          const locals = new Map<string, Value>();
          fn.params.forEach((p, i) => locals.set(p, args[i] ?? 0));
          stack.push({ locals, returnDest: q.result, returnIp: ip + 1 });
          ip = fn.start;
          break;
        }
        case "return": {
          const value = q.arg1 !== null ? get1(ip) : 0;
          const frame = stack.pop();
          if (!frame || stack.length === 0) {
            return { output, steps, halted: true };
          }
          if (frame.returnDest) {
            stack[stack.length - 1]!.locals.set(frame.returnDest, value);
          }
          ip = frame.returnIp;
          break;
        }
        case "list": {
          const els = (q.args ?? []).map((a) => resolve(a));
          if (q.result) setLocal(q.result, els);
          ip += 1;
          break;
        }
        case "index": {
          const tgt = get1(ip);
          const idx = get2(ip);
          let v: Value;
          if (Array.isArray(tgt)) v = tgt[checkedIndex(tgt, idx, "List")]!;
          else if (typeof tgt === "string") v = tgt[checkedIndex(tgt, idx, "String")]!;
          else if (typeof tgt === "number") v = Number(idx);
          else v = 0;
          if (q.result) setLocal(q.result, v);
          ip += 1;
          break;
        }
        case "setindex": {
          const tgt = get1(ip);
          const idx = get2(ip);
          const val = resolve(q.args?.[0] ?? "0");
          if (!Array.isArray(tgt)) fault(`Cannot change an item of ${q.arg1}: it is not a list`);
          const at = checkedIndex(tgt, idx, "List");
          // Copy on write: a list is a value, so another variable that holds it is not changed.
          const copy = tgt.slice();
          copy[at] = val;
          if (q.arg1) store(q.arg1, copy);
          ip += 1;
          break;
        }
        case "len": {
          const tgt = get1(ip);
          let n = 0;
          if (Array.isArray(tgt)) n = tgt.length;
          else if (typeof tgt === "string") n = tgt.length;
          else if (typeof tgt === "number") n = tgt;
          if (q.result) setLocal(q.result, n);
          ip += 1;
          break;
        }
        case "input": {
          if (q.result) setLocal(q.result, "");
          ip += 1;
          break;
        }
        default: {
          ip += 1;
        }
      }
    }
  } catch (e) {
    if (e instanceof RuntimeFault) return fail(e.message, quads[ip]?.srcLine ?? 0);
    throw e;
  }

  return { output, steps, halted: true };
}
