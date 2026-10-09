import type { CompilerError, ExecutionResult, ExecStep, Quad } from "./types.ts";

type Value = number | string | boolean | Value[];

interface FuncInfo {
  start: number;
  params: string[];
}

interface Frame {
  locals: Map<string, Value>;
  returnDest: string | null;
  returnIp: number;
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

export function execute(quads: Quad[]): ExecutionResult {
  const output: string[] = [];
  const steps: ExecStep[] = [];
  const funcs = new Map<string, FuncInfo>();
  const labels = new Map<string, number>();

  for (let i = 0; i < quads.length; i++) {
    const q = quads[i]!;
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
  const stack: Frame[] = [{ locals: new Map(), returnDest: null, returnIp: -1 }];
  const argStack: Value[] = [];
  let stepsCount = 0;
  const maxSteps = 8000;

  const resolve = (raw: string | null): Value => {
    if (raw === null) return 0;
    const lit = parseValue(raw);
    if (lit !== undefined) return lit;
    for (let i = stack.length - 1; i >= 0; i--) {
      const frame = stack[i]!;
      if (frame.locals.has(raw)) return frame.locals.get(raw)!;
    }
    return 0;
  };

  // A plain assignment to a name the current frame lacks writes the global;
  // a declaration ("decl" marker from ir.ts) always creates a local.
  const assign = (name: string, value: Value, declare = false) => {
    const frame = stack[stack.length - 1]!;
    const global = stack[0]!;
    if (!declare && !frame.locals.has(name) && global.locals.has(name)) {
      global.locals.set(name, value);
      return;
    }
    frame.locals.set(name, value);
  };

  const bin = (op: string, a: Value, b: Value): Value => {
    switch (op) {
      case "+":
        if (typeof a === "string" || typeof b === "string") return String(a) + String(b);
        return Number(a) + Number(b);
      case "-":
        return Number(a) - Number(b);
      case "*":
        return Number(a) * Number(b);
      case "/":
        return Number(b) === 0 ? 0 : Number(a) / Number(b);
      case "//":
        return Number(b) === 0 ? 0 : Math.trunc(Number(a) / Number(b));
      case "%":
        return Number(b) === 0 ? 0 : Number(a) % Number(b);
      case "==":
        return a === b;
      case "!=":
        return a !== b;
      case "<":
        return Number(a) < Number(b);
      case ">":
        return Number(a) > Number(b);
      case "<=":
        return Number(a) <= Number(b);
      case ">=":
        return Number(a) >= Number(b);
      case "and":
        return truthy(a) && truthy(b);
      case "or":
        return truthy(a) || truthy(b);
      default:
        return 0;
    }
  };

  const fail = (message: string, line = 0): ExecutionResult => ({
    output,
    steps,
    halted: true,
    error: { phase: "Runtime", message, line, column: 0 },
  });

  while (ip >= 0 && ip < quads.length && stepsCount < maxSteps) {
    const q = quads[ip]!;
    stepsCount += 1;
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

    steps.push({ ip, text: q.text });

    switch (q.op) {
      case "=": {
        if (q.result) assign(q.result, resolve(q.arg1), q.args?.[0] === "decl");
        ip += 1;
        break;
      }
      case "neg": {
        if (q.result) assign(q.result, -Number(resolve(q.arg1)));
        ip += 1;
        break;
      }
      case "not": {
        if (q.result) assign(q.result, !truthy(resolve(q.arg1)));
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
        const right = resolve(q.arg2);
        if ((q.op === "/" || q.op === "//" || q.op === "%") && Number(right) === 0) {
          return fail("Division by zero", q.srcLine);
        }
        if (q.result) assign(q.result, bin(q.op, resolve(q.arg1), right));
        ip += 1;
        break;
      }
      case "print": {
        const v = display(resolve(q.arg1));
        output.push(v);
        steps[steps.length - 1]!.output = v;
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
        const cond = resolve(q.arg1);
        if (!truthy(cond)) {
          const t = q.arg2 ? labels.get(q.arg2) : undefined;
          if (t === undefined) return fail(`Unknown label ${q.arg2}`, q.srcLine);
          ip = t;
        } else {
          ip += 1;
        }
        break;
      }
      case "ifTrue": {
        const cond = resolve(q.arg1);
        if (truthy(cond)) {
          const t = q.arg2 ? labels.get(q.arg2) : undefined;
          if (t === undefined) return fail(`Unknown label ${q.arg2}`, q.srcLine);
          ip = t;
        } else {
          ip += 1;
        }
        break;
      }
      case "param": {
        argStack.push(resolve(q.arg1));
        ip += 1;
        break;
      }
      case "call": {
        const fname = q.arg1 ?? "";
        const n = Number(q.arg2 ?? 0);
        const fn = funcs.get(fname);
        if (!fn) return fail(`Unknown function ${fname}`, q.srcLine);
        const args = argStack.splice(argStack.length - n, n);
        const locals = new Map<string, Value>();
        fn.params.forEach((p, i) => locals.set(p, args[i] ?? 0));
        stack.push({ locals, returnDest: q.result, returnIp: ip + 1 });
        ip = fn.start;
        break;
      }
      case "return": {
        const value = q.arg1 !== null ? resolve(q.arg1) : 0;
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
        if (q.result) assign(q.result, els);
        ip += 1;
        break;
      }
      case "index": {
        const tgt = resolve(q.arg1);
        const idx = Number(resolve(q.arg2));
        let v: Value = 0;
        if (Array.isArray(tgt)) v = tgt[idx] ?? 0;
        else if (typeof tgt === "string") v = tgt[idx] ?? "";
        else if (typeof tgt === "number") v = idx;
        if (q.result) assign(q.result, v, q.args?.[0] === "decl");
        ip += 1;
        break;
      }
      case "setindex": {
        const tgt = resolve(q.arg1);
        const idx = Number(resolve(q.arg2));
        const val = resolve(q.args?.[0] ?? "0");
        if (Array.isArray(tgt) && q.arg1) {
          const copy = [...tgt];
          copy[idx] = val;
          assign(q.arg1, copy);
        }
        ip += 1;
        break;
      }
      case "len": {
        const tgt = resolve(q.arg1);
        let n = 0;
        if (Array.isArray(tgt)) n = tgt.length;
        else if (typeof tgt === "string") n = tgt.length;
        else if (typeof tgt === "number") n = tgt;
        if (q.result) assign(q.result, n);
        ip += 1;
        break;
      }
      case "input": {
        if (q.result) assign(q.result, "");
        ip += 1;
        break;
      }
      default: {
        ip += 1;
      }
    }
  }

  if (stepsCount >= maxSteps) {
    const err: CompilerError = {
      phase: "Runtime",
      message: "Execution stopped after 8000 steps (possible infinite loop)",
      line: 0,
      column: 0,
    };
    return { output, steps, halted: true, error: err };
  }

  return { output, steps, halted: true };
}
