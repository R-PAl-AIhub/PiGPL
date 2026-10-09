import type { Expr, FnStmt, Program, Stmt } from "./ast.ts";
import { EventLog } from "./events.ts";
import type { Quad } from "./types.ts";

export interface IrGenResult {
  quads: Quad[];
  functions: Record<string, { params: string[]; startHint: string }>;
}

export function generateIR(program: Program, log?: EventLog): IrGenResult {
  const quads: Quad[] = [];
  let temp = 0;
  let labels = 0;
  let id = 0;
  const functions: Record<string, { params: string[]; startHint: string }> = {};

  const newTemp = () => `t${temp++}`;
  const newLabel = () => `L${labels++}`;

  function emit(
    result: string | null,
    op: string,
    arg1: string | null,
    arg2: string | null,
    srcLine?: number,
    extra?: string[],
  ): Quad {
    const text = formatQuad({ result, op, arg1, arg2, args: extra });
    const event = log?.emit("ir", "emit", text, undefined, { op, result, arg1, arg2 });
    const q: Quad = {
      id: id++,
      result,
      op,
      arg1,
      arg2,
      args: extra,
      srcLine,
      eventId: event?.id ?? id,
      text,
    };
    quads.push(q);
    return q;
  }

  function genExpr(expr: Expr): string {
    switch (expr.kind) {
      case "literal": {
        const t = newTemp();
        emit(t, "=", literalText(expr.value), null, expr.loc.line);
        return t;
      }
      case "identifier":
        return expr.name;
      case "unary": {
        const v = genExpr(expr.operand);
        const t = newTemp();
        emit(t, expr.operator === "not" ? "not" : "neg", v, null, expr.loc.line);
        return t;
      }
      case "binary": {
        const a = genExpr(expr.left);
        const b = genExpr(expr.right);
        const t = newTemp();
        // int / int stays an int (semantic.ts types it as int), so it gets its own op.
        const op = expr.operator === "/" && expr.resolvedType === "int" ? "//" : expr.operator;
        emit(t, op, a, b, expr.loc.line);
        return t;
      }
      case "call": {
        if (expr.callee.kind === "identifier" && expr.callee.name === "input") {
          const t = newTemp();
          emit(t, "input", null, null, expr.loc.line);
          return t;
        }
        const argNames = expr.args.map((a) => genExpr(a));
        for (const a of argNames) emit(null, "param", a, null, expr.loc.line);
        const t = newTemp();
        const fname = expr.callee.kind === "identifier" ? expr.callee.name : genExpr(expr.callee);
        emit(t, "call", fname, String(argNames.length), expr.loc.line);
        return t;
      }
      case "list": {
        const els = expr.elements.map((e) => genExpr(e));
        const t = newTemp();
        emit(t, "list", String(els.length), null, expr.loc.line, els);
        return t;
      }
      case "index": {
        const tgt = genExpr(expr.target);
        const idx = genExpr(expr.index);
        const t = newTemp();
        emit(t, "index", tgt, idx, expr.loc.line);
        return t;
      }
    }
  }

  function genBlock(stmts: Stmt[]) {
    for (const s of stmts) genStmt(s);
  }

  function genStmt(stmt: Stmt) {
    switch (stmt.kind) {
      case "declaration": {
        const v = genExpr(stmt.value);
        emit(stmt.name, "=", v, null, stmt.loc.line, ["decl"]);
        break;
      }
      case "assignment": {
        const v = genExpr(stmt.value);
        emit(stmt.name, "=", v, null, stmt.loc.line);
        break;
      }
      case "index-assign": {
        const tgt = genExpr(stmt.target);
        const idx = genExpr(stmt.index);
        const v = genExpr(stmt.value);
        emit(null, "setindex", tgt, idx, stmt.loc.line, [v]);
        break;
      }
      case "print": {
        const v = genExpr(stmt.expression);
        emit(null, "print", v, null, stmt.loc.line);
        break;
      }
      case "if": {
        const end = newLabel();
        let next = newLabel();
        const cond = genExpr(stmt.condition);
        emit(null, "ifFalse", cond, next, stmt.loc.line);
        genBlock(stmt.thenBlock);
        emit(null, "goto", end, null, stmt.loc.line);
        emit(next, "label", null, null, stmt.loc.line);
        for (const el of stmt.elifs) {
          next = newLabel();
          const c = genExpr(el.condition);
          emit(null, "ifFalse", c, next, stmt.loc.line);
          genBlock(el.block);
          emit(null, "goto", end, null, stmt.loc.line);
          emit(next, "label", null, null, stmt.loc.line);
        }
        if (stmt.elseBlock) genBlock(stmt.elseBlock);
        emit(end, "label", null, null, stmt.loc.line);
        break;
      }
      case "while": {
        const start = newLabel();
        const end = newLabel();
        emit(start, "label", null, null, stmt.loc.line);
        const cond = genExpr(stmt.condition);
        emit(null, "ifFalse", cond, end, stmt.loc.line);
        genBlock(stmt.body);
        emit(null, "goto", start, null, stmt.loc.line);
        emit(end, "label", null, null, stmt.loc.line);
        break;
      }
      case "for": {
        const iterableType = stmt.iterable.resolvedType ?? "";
        if (iterableType === "int") {
          const n = genExpr(stmt.iterable);
          const start = newLabel();
          const end = newLabel();
          emit(stmt.iterator, "=", "0", null, stmt.loc.line, ["decl"]);
          emit(start, "label", null, null, stmt.loc.line);
          const cmp = newTemp();
          emit(cmp, "<", stmt.iterator, n, stmt.loc.line);
          emit(null, "ifFalse", cmp, end, stmt.loc.line);
          genBlock(stmt.body);
          const nxt = newTemp();
          emit(nxt, "+", stmt.iterator, "1", stmt.loc.line);
          emit(stmt.iterator, "=", nxt, null, stmt.loc.line);
          emit(null, "goto", start, null, stmt.loc.line);
          emit(end, "label", null, null, stmt.loc.line);
        } else {
          const iter = genExpr(stmt.iterable);
          const idx = newTemp();
          const len = newTemp();
          const start = newLabel();
          const end = newLabel();
          emit(idx, "=", "0", null, stmt.loc.line);
          emit(len, "len", iter, null, stmt.loc.line);
          emit(start, "label", null, null, stmt.loc.line);
          const cmp = newTemp();
          emit(cmp, "<", idx, len, stmt.loc.line);
          emit(null, "ifFalse", cmp, end, stmt.loc.line);
          emit(stmt.iterator, "index", iter, idx, stmt.loc.line, ["decl"]);
          genBlock(stmt.body);
          const nxt = newTemp();
          emit(nxt, "+", idx, "1", stmt.loc.line);
          emit(idx, "=", nxt, null, stmt.loc.line);
          emit(null, "goto", start, null, stmt.loc.line);
          emit(end, "label", null, null, stmt.loc.line);
        }
        break;
      }
      case "fn":
        genFn(stmt);
        break;
      case "return": {
        if (stmt.value) {
          const v = genExpr(stmt.value);
          emit(null, "return", v, null, stmt.loc.line);
        } else {
          emit(null, "return", null, null, stmt.loc.line);
        }
        break;
      }
      case "expr-stmt":
        genExpr(stmt.expression);
        break;
    }
  }

  function genFn(fn: FnStmt) {
    functions[fn.name] = { params: fn.params.map((p) => p.name), startHint: fn.name };
    emit(fn.name, "func", fn.params.map((p) => p.name).join(","), fn.returnType, fn.loc.line);
    genBlock(fn.body);
    emit(null, "endfunc", fn.name, null, fn.loc.line);
  }

  for (const stmt of program.statements) {
    if (stmt.kind === "fn") genFn(stmt);
  }
  emit("main", "func", "", "void");
  for (const stmt of program.statements) {
    if (stmt.kind !== "fn") genStmt(stmt);
  }
  emit(null, "endfunc", "main", null);

  return { quads, functions };
}

export function formatQuad(q: {
  result: string | null;
  op: string;
  arg1: string | null;
  arg2: string | null;
  args?: string[];
}): string {
  const { result, op, arg1, arg2, args } = q;
  switch (op) {
    case "label":
      return `${result}:`;
    case "func":
      return `func ${result}${arg1 ? `(${arg1})` : "()"}`;
    case "endfunc":
      return `endfunc ${arg1 ?? ""}`.trim();
    case "goto":
      return `goto ${arg1}`;
    case "ifFalse":
      return `ifFalse ${arg1} goto ${arg2}`;
    case "ifTrue":
      return `ifTrue ${arg1} goto ${arg2}`;
    case "print":
      return `print ${arg1}`;
    case "param":
      return `param ${arg1}`;
    case "call":
      return `${result} = call ${arg1}, ${arg2}`;
    case "return":
      return arg1 ? `return ${arg1}` : "return";
    case "=":
      return `${result} = ${arg1}`;
    case "neg":
      return `${result} = - ${arg1}`;
    case "not":
      return `${result} = not ${arg1}`;
    case "list":
      return `${result} = [${(args ?? []).join(", ")}]`;
    case "index":
      return `${result} = ${arg1}[${arg2}]`;
    case "setindex":
      return `${arg1}[${arg2}] = ${args?.[0] ?? ""}`;
    case "len":
      return `${result} = len ${arg1}`;
    case "input":
      return `${result} = input()`;
    default:
      if (result && arg1 && arg2) return `${result} = ${arg1} ${op} ${arg2}`;
      if (result && arg1) return `${result} = ${op} ${arg1}`;
      return [result, op, arg1, arg2].filter((x) => x !== null).join(" ");
  }
}

function literalText(value: number | string | boolean): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}
