import { EventLog } from "./events.ts";
import { formatQuad } from "./ir.ts";
import type { OptimizationStep, Quad } from "./types.ts";

const BINOPS = new Set(["+", "-", "*", "/", "//", "%","==", "!=", "<", ">", "<=", ">=", "and", "or"]);

function isTemp(name: string | null): name is string {
  return !!name && /^t\d+$/.test(name);
}

function parseConst(raw: string | null): { ok: true; value: number | string | boolean } | { ok: false } {
  if (raw === null) return { ok: false };
  if (raw === "true") return { ok: true, value: true };
  if (raw === "false") return { ok: true, value: false };
  if (/^-?\d+$/.test(raw)) return { ok: true, value: Number(raw) };
  if (/^-?\d+\.\d+$/.test(raw)) return { ok: true, value: Number(raw) };
  if (raw.startsWith('"') && raw.endsWith('"')) {
    try {
      return { ok: true, value: JSON.parse(raw) as string };
    } catch {
      return { ok: false };
    }
  }
  return { ok: false };
}

function constText(v: number | string | boolean): string {
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

function evalBin(
  op: string,
  a: number | string | boolean,
  b: number | string | boolean,
): number | string | boolean | undefined {
  switch (op) {
    case "+":
      if (typeof a === "number" && typeof b === "number") return a + b;
      if (typeof a === "string" && typeof b === "string") return a + b;
      return undefined;
    case "-":
      if (typeof a === "number" && typeof b === "number") return a - b;
      return undefined;
    case "*":
      if (typeof a === "number" && typeof b === "number") return a * b;
      return undefined;
    case "/":
      if (typeof a === "number" && typeof b === "number" && b !== 0) return a / b;
      return undefined;
    case "//":
      if (typeof a === "number" && typeof b === "number" && b !== 0) return Math.trunc(a / b);
      return undefined;
    case "%":
      if (typeof a === "number" && typeof b === "number" && b !== 0) return a % b;
      return undefined;
    case "==":
      return a === b;
    case "!=":
      return a !== b;
    case "<":
      if (typeof a === "number" && typeof b === "number") return a < b;
      return undefined;
    case ">":
      if (typeof a === "number" && typeof b === "number") return a > b;
      return undefined;
    case "<=":
      if (typeof a === "number" && typeof b === "number") return a <= b;
      return undefined;
    case ">=":
      if (typeof a === "number" && typeof b === "number") return a >= b;
      return undefined;
    case "and":
      if (typeof a === "boolean" && typeof b === "boolean") return a && b;
      return undefined;
    case "or":
      if (typeof a === "boolean" && typeof b === "boolean") return a || b;
      return undefined;
    default:
      return undefined;
  }
}

function cloneQuad(q: Quad, overrides: Partial<Quad> = {}): Quad {
  const next = { ...q, ...overrides, args: overrides.args ?? q.args };
  next.text = formatQuad(next);
  return next;
}

function isLeaderOp(op: string) {
  return op === "label" || op === "func";
}

function isTerminator(op: string) {
  return op === "goto" || op === "ifFalse" || op === "ifTrue" || op === "return" || op === "endfunc";
}

export function optimize(
  input: Quad[],
  log?: EventLog,
): { quads: Quad[]; steps: OptimizationStep[] } {
  const steps: OptimizationStep[] = [];
  let quads: Quad[] = input.map((q) => ({ ...q, args: q.args ? [...q.args] : undefined }));
  let stepId = 0;

  const record = (kind: OptimizationStep["kind"], message: string, before: string, after: string) => {
    const event = log?.emit("optimize", kind, message, undefined, { before, after });
    steps.push({
      id: stepId++,
      kind,
      message,
      before,
      after,
      eventId: event?.id ?? stepId,
    });
  };

  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    const constMap = new Map<string, string>();

    const resetFlow = () => constMap.clear();

    const subst = (name: string | null): string | null => {
      if (!name) return name;
      return constMap.get(name) ?? name;
    };

    for (let i = 0; i < quads.length; i++) {
      const q = quads[i]!;
      if (isLeaderOp(q.op) || q.op === "label") {
        resetFlow();
        continue;
      }

      if (q.op === "=" && q.result && q.arg1) {
        const a = subst(q.arg1);
        if (a !== q.arg1) {
          record("propagate", `Propagate ${q.arg1} → ${a}`, q.text, `${q.result} = ${a}`);
          quads[i] = cloneQuad(q, { arg1: a, eventId: steps[steps.length - 1]?.eventId ?? q.eventId });
          changed = true;
        }
        const cur = quads[i]!;
        const c = parseConst(cur.arg1);
        if (c.ok) constMap.set(cur.result!, constText(c.value));
        else constMap.delete(cur.result!);
        continue;
      }

      if (BINOPS.has(q.op) && q.result) {
        let a = subst(q.arg1);
        let b = subst(q.arg2);
        if (a !== q.arg1 || b !== q.arg2) {
          const next = cloneQuad(q, { arg1: a, arg2: b });
          record("propagate", `Propagate operands in ${q.text}`, q.text, next.text);
          quads[i] = { ...next, eventId: steps[steps.length - 1]?.eventId ?? q.eventId };
          changed = true;
        }
        const cur = quads[i]!;
        a = cur.arg1;
        b = cur.arg2;
        const ca = parseConst(a);
        const cb = parseConst(b);
        if (ca.ok && cb.ok) {
          const folded = evalBin(cur.op, ca.value, cb.value);
          if (folded !== undefined) {
            const text = constText(folded);
            record("fold", `Fold ${cur.text}`, cur.text, `${cur.result} = ${text}`);
            quads[i] = cloneQuad(cur, {
              op: "=",
              arg1: text,
              arg2: null,
              eventId: steps[steps.length - 1]?.eventId ?? cur.eventId,
            });
            constMap.set(cur.result!, text);
            changed = true;
            continue;
          }
        }
        const algebraic = algebra(cur);
        if (algebraic) {
          record("algebraic", algebraic.message, cur.text, algebraic.after.text);
          quads[i] = { ...algebraic.after, eventId: steps[steps.length - 1]?.eventId ?? cur.eventId };
          changed = true;
          continue;
        }
        if (cur.result) constMap.delete(cur.result);
        continue;
      }

      if ((q.op === "neg" || q.op === "not") && q.result) {
        const a = subst(q.arg1);
        if (a !== q.arg1) {
          const next = cloneQuad(q, { arg1: a });
          record("propagate", `Propagate operand in ${q.text}`, q.text, next.text);
          quads[i] = { ...next, eventId: steps[steps.length - 1]?.eventId ?? q.eventId };
          changed = true;
        }
        const cur = quads[i]!;
        const c = parseConst(cur.arg1);
        if (c.ok) {
          const v = cur.op === "neg" ? (typeof c.value === "number" ? -c.value : undefined) : typeof c.value === "boolean" ? !c.value : undefined;
          if (v !== undefined) {
            const text = constText(v);
            record("fold", `Fold ${cur.text}`, cur.text, `${cur.result} = ${text}`);
            quads[i] = cloneQuad(cur, {
              op: "=",
              arg1: text,
              arg2: null,
              eventId: steps[steps.length - 1]?.eventId ?? cur.eventId,
            });
            constMap.set(cur.result!, text);
            changed = true;
            continue;
          }
        }
        if (cur.result) constMap.delete(cur.result);
        continue;
      }

      if (q.result) constMap.delete(q.result);
      if (isTerminator(q.op)) resetFlow();
      // A called function can change globals, so forget every known variable value.
      if (q.op === "call") {
        for (const name of [...constMap.keys()]) if (!isTemp(name)) constMap.delete(name);
      }
    }

    const used = new Set<string>();
    for (const q of quads) {
      for (const n of [q.arg1, q.arg2, ...(q.args ?? [])]) {
        if (n && !parseConst(n).ok) used.add(n);
      }
    }
    const kept: Quad[] = [];
    for (const q of quads) {
      const deadAssign =
        q.result &&
        isTemp(q.result) &&
        (q.op === "=" || BINOPS.has(q.op) || q.op === "neg" || q.op === "not") &&
        !used.has(q.result);
      if (deadAssign) {
        record("dce", `Remove unused ${q.text}`, q.text, "∅");
        changed = true;
        continue;
      }
      kept.push(q);
    }
    quads = kept;
    if (!changed) break;
  }

  return { quads, steps };
}

function algebra(q: Quad): { message: string; after: Quad } | null {
  if (!q.result || !q.arg1 || !q.arg2) return null;
  const op = q.op;
  const a = q.arg1;
  const b = q.arg2;
  const zb = b === "0" || b === "0.0";
  const za = a === "0" || a === "0.0";
  const ob = b === "1" || b === "1.0";
  const oa = a === "1" || a === "1.0";
  if (op === "+" && zb) return { message: "x + 0 → x", after: cloneQuad(q, { op: "=", arg1: a, arg2: null }) };
  if (op === "+" && za) return { message: "0 + x → x", after: cloneQuad(q, { op: "=", arg1: b, arg2: null }) };
  if (op === "-" && zb) return { message: "x - 0 → x", after: cloneQuad(q, { op: "=", arg1: a, arg2: null }) };
  if (op === "*" && ob) return { message: "x * 1 → x", after: cloneQuad(q, { op: "=", arg1: a, arg2: null }) };
  if (op === "*" && oa) return { message: "1 * x → x", after: cloneQuad(q, { op: "=", arg1: b, arg2: null }) };
  if (op === "*" && (za || zb))
    return { message: "x * 0 → 0", after: cloneQuad(q, { op: "=", arg1: "0", arg2: null }) };
  if (op === "/" && ob) return { message: "x / 1 → x", after: cloneQuad(q, { op: "=", arg1: a, arg2: null }) };
  return null;
}
