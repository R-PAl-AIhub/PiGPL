import type { Expr, FnStmt, Program, Stmt } from "./ast.ts";
import { EventLog } from "./events.ts";
import { SymbolTable } from "./symbol-table.ts";
import type { CompilerError, SemanticCheck } from "./types.ts";

const NUMERIC = new Set(["int", "float"]);
const COMPARISON = new Set(["==", "!=", "<", ">", "<=", ">="]);
const ARITH = new Set(["+", "-", "*", "/", "%"]);

function listElemType(t: string | undefined): string | undefined {
  if (!t) return undefined;
  const m = /^list\[(.+)\]$/.exec(t);
  return m ? m[1] : t === "list" ? "unknown" : undefined;
}

function asListType(elem: string) {
  return elem === "unknown" ? "list" : `list[${elem}]`;
}

export function analyze(
  program: Program,
  log?: EventLog,
): { symbols: SymbolTable; checks: SemanticCheck[]; errors: CompilerError[] } {
  const symbols = new SymbolTable();
  const checks: SemanticCheck[] = [];
  const errors: CompilerError[] = [];
  const fnReturnStack: string[] = [];

  const locOfNode = (node: { loc: { line: number; column: number; start: number; end: number } }) =>
    node.loc;

  function emitCheck(ok: boolean, message: string, line = 0, column = 0) {
    const event = log?.emit(ok ? "semantic" : "semantic", ok ? "check" : "fail", message, {
      line,
      column,
      start: 0,
      end: 0,
    });
    checks.push({ ok, message, eventId: event?.id ?? checks.length + 1, line, column });
  }

  function error(message: string, node: { loc: { line: number; column: number; start?: number; end?: number } }) {
    const err: CompilerError = {
      phase: "Semantic",
      message,
      line: node.loc.line,
      column: node.loc.column,
      start: node.loc.start,
      end: node.loc.end,
    };
    errors.push(err);
    log?.emit("semantic", "error", message, locOfNode(node as { loc: { line: number; column: number; start: number; end: number } }));
    emitCheck(false, message, node.loc.line, node.loc.column);
  }

  function compatible(declared: string, actual: string) {
    if (declared === actual) return true;
    if (declared === "unknown" || actual === "unknown") return true;
    if (NUMERIC.has(declared) && NUMERIC.has(actual)) return true;
    if (declared === "list" && actual.startsWith("list")) return true;
    if (actual === "list" && declared.startsWith("list")) return true;
    const de = listElemType(declared);
    const ae = listElemType(actual);
    if (de && ae && (de === ae || de === "unknown" || ae === "unknown")) return true;
    return false;
  }

  function visitStmt(stmt: Stmt) {
    switch (stmt.kind) {
      case "declaration":
        visitDeclaration(stmt);
        break;
      case "assignment":
        visitAssignment(stmt);
        break;
      case "index-assign":
        visitIndexAssign(stmt);
        break;
      case "print":
        visitExpr(stmt.expression);
        emitCheck(true, "print() argument is a valid expression", stmt.loc.line, stmt.loc.column);
        break;
      case "if":
        visitIf(stmt);
        break;
      case "while":
        visitWhile(stmt);
        break;
      case "for":
        visitFor(stmt);
        break;
      case "fn":
        visitFn(stmt);
        break;
      case "return":
        visitReturn(stmt);
        break;
      case "expr-stmt":
        visitExpr(stmt.expression);
        break;
    }
  }

  function visitDeclaration(stmt: Extract<Stmt, { kind: "declaration" }>) {
    if (symbols.lookupInCurrent(stmt.name)) {
      error(`Identifier '${stmt.name}' is already declared`, stmt);
      return;
    }
    const valueType = visitExpr(stmt.value);
    emitCheck(true, `Declaration valid: let ${stmt.name} : ${stmt.varType}`, stmt.loc.line, stmt.loc.column);
    if (valueType && !compatible(stmt.varType, valueType)) {
      error(
        `Type mismatch in declaration of '${stmt.name}': expected ${stmt.varType}, found ${valueType}`,
        stmt,
      );
      emitCheck(false, `Type valid for '${stmt.name}' (${stmt.varType} = ${valueType})`, stmt.loc.line, stmt.loc.column);
    } else if (valueType) {
      emitCheck(true, `Type valid for '${stmt.name}' (${stmt.varType})`, stmt.loc.line, stmt.loc.column);
    }
    const event = log?.emit("symbols", "declare", `declare ${stmt.name}: ${stmt.varType}`, stmt.loc, {
      name: stmt.name,
      type: stmt.varType,
    });
    symbols.declare({
      name: stmt.name,
      varType: stmt.varType,
      value: literalValue(stmt.value),
      kind: "var",
      eventId: event?.id ?? 0,
      line: stmt.loc.line,
      column: stmt.loc.column,
    });
  }

  function visitAssignment(stmt: Extract<Stmt, { kind: "assignment" }>) {
    const entry = symbols.lookup(stmt.name);
    if (!entry) {
      error(`Undeclared identifier: ${stmt.name}`, stmt);
      visitExpr(stmt.value);
      return;
    }
    if (entry.kind === "fn") {
      error(`Cannot assign to function '${stmt.name}'`, stmt);
      return;
    }
    emitCheck(true, `Identifier declared: '${stmt.name}'`, stmt.loc.line, stmt.loc.column);
    const valueType = visitExpr(stmt.value);
    if (valueType && !compatible(entry.varType, valueType)) {
      error(
        `Type mismatch in assignment to '${stmt.name}': expected ${entry.varType}, found ${valueType}`,
        stmt,
      );
    } else {
      emitCheck(true, `Type valid for assignment to '${stmt.name}'`, stmt.loc.line, stmt.loc.column);
      symbols.updateValue(stmt.name, literalValue(stmt.value));
    }
  }

  function visitIndexAssign(stmt: Extract<Stmt, { kind: "index-assign" }>) {
    const targetType = visitExpr(stmt.target);
    const indexType = visitExpr(stmt.index);
    const valueType = visitExpr(stmt.value);
    if (indexType && indexType !== "int") {
      error(`List index must be int, found ${indexType}`, stmt);
    }
    const elem = listElemType(targetType ?? "") ?? (targetType === "list" ? "unknown" : undefined);
    if (!elem) {
      error("Indexed assignment requires a list", stmt);
      return;
    }
    if (valueType && elem !== "unknown" && !compatible(elem, valueType)) {
      error(`Type mismatch in list assignment: expected ${elem}, found ${valueType}`, stmt);
    }
  }

  function visitIf(stmt: Extract<Stmt, { kind: "if" }>) {
    const cond = visitExpr(stmt.condition);
    checkCondition(cond, stmt);
    for (const s of stmt.thenBlock) visitStmt(s);
    for (const el of stmt.elifs) {
      const c = visitExpr(el.condition);
      checkCondition(c, stmt);
      for (const s of el.block) visitStmt(s);
    }
    if (stmt.elseBlock) for (const s of stmt.elseBlock) visitStmt(s);
  }

  function visitWhile(stmt: Extract<Stmt, { kind: "while" }>) {
    const cond = visitExpr(stmt.condition);
    checkCondition(cond, stmt);
    for (const s of stmt.body) visitStmt(s);
  }

  function visitFor(stmt: Extract<Stmt, { kind: "for" }>) {
    const iterType = visitExpr(stmt.iterable);
    let elemType = "int";
    if (iterType === "int") elemType = "int";
    else if (iterType && (iterType === "list" || iterType.startsWith("list"))) {
      elemType = listElemType(iterType) ?? "unknown";
    } else if (iterType === "string") {
      elemType = "string";
    } else if (iterType) {
      error(`Cannot iterate over type ${iterType}`, stmt);
    }
    log?.emit("semantic", "scope", `enter loop ${stmt.iterator}`, stmt.loc);
    symbols.enterScope(`for:${stmt.iterator}:${stmt.id}`);
    const event = log?.emit("symbols", "declare", `declare ${stmt.iterator}: ${elemType}`, stmt.loc);
    symbols.declare({
      name: stmt.iterator,
      varType: elemType,
      value: null,
      kind: "loop",
      eventId: event?.id ?? 0,
      line: stmt.loc.line,
      column: stmt.loc.column,
    });
    emitCheck(true, `Loop variable '${stmt.iterator}' : ${elemType}`, stmt.loc.line, stmt.loc.column);
    for (const s of stmt.body) visitStmt(s);
    symbols.exitScope();
    log?.emit("semantic", "scope", `exit loop ${stmt.iterator}`, stmt.loc);
  }

  function visitFn(stmt: FnStmt) {
    if (symbols.lookupInCurrent(stmt.name)) {
      error(`Identifier '${stmt.name}' is already declared`, stmt);
    }
    const sig = `fn(${stmt.params.map((p) => p.type).join(",")})->${stmt.returnType}`;
    const event = log?.emit("symbols", "declare", `declare ${stmt.name}: ${sig}`, stmt.loc);
    symbols.declare({
      name: stmt.name,
      varType: sig,
      value: { params: stmt.params, returnType: stmt.returnType },
      kind: "fn",
      eventId: event?.id ?? 0,
      line: stmt.loc.line,
      column: stmt.loc.column,
    });
    emitCheck(true, `Function '${stmt.name}' declared`, stmt.loc.line, stmt.loc.column);
    symbols.enterScope(`fn:${stmt.name}`);
    log?.emit("semantic", "scope", `enter ${stmt.name}`, stmt.loc);
    for (const p of stmt.params) {
      if (symbols.lookupInCurrent(p.name)) {
        error(`Duplicate parameter '${p.name}'`, { loc: p.loc });
        continue;
      }
      const pe = log?.emit("symbols", "declare", `param ${p.name}: ${p.type}`, p.loc);
      symbols.declare({
        name: p.name,
        varType: p.type,
        value: null,
        kind: "param",
        eventId: pe?.id ?? 0,
        line: p.loc.line,
        column: p.loc.column,
      });
    }
    fnReturnStack.push(stmt.returnType);
    for (const s of stmt.body) visitStmt(s);
    fnReturnStack.pop();
    symbols.exitScope();
    log?.emit("semantic", "scope", `exit ${stmt.name}`, stmt.loc);
  }

  function visitReturn(stmt: Extract<Stmt, { kind: "return" }>) {
    const expected = fnReturnStack[fnReturnStack.length - 1];
    if (expected === undefined) {
      error("return outside of a function", stmt);
      return;
    }
    if (stmt.value) {
      const t = visitExpr(stmt.value);
      if (expected === "void") {
        error("Function with no return type cannot return a value", stmt);
      } else if (t && !compatible(expected, t)) {
        error(`Return type mismatch: expected ${expected}, found ${t}`, stmt);
      } else {
        emitCheck(true, `Return type ${t} matches ${expected}`, stmt.loc.line, stmt.loc.column);
      }
    } else if (expected !== "void") {
      error(`Function must return ${expected}`, stmt);
    }
  }

  function checkCondition(cond: string | undefined, node: { loc: { line: number; column: number } }) {
    if (!cond) return;
    if (cond !== "bool") {
      error(`Condition must be bool, found ${cond}`, node);
    } else {
      emitCheck(true, "Condition is a valid boolean expression", node.loc.line, node.loc.column);
    }
  }

  function visitExpr(node: Expr): string | undefined {
    switch (node.kind) {
      case "literal":
        node.resolvedType = node.literalType;
        return node.literalType;
      case "identifier": {
        if (node.name === "input") {
          node.resolvedType = "fn()->string";
          return node.resolvedType;
        }
        const entry = symbols.lookup(node.name);
        if (!entry) {
          error(`Undeclared identifier: ${node.name}`, node);
          return undefined;
        }
        emitCheck(true, `Identifier declared: '${node.name}'`, node.loc.line, node.loc.column);
        log?.emit("semantic", "lookup", `lookup ${node.name} → ${entry.varType}`, node.loc);
        node.resolvedType = entry.varType;
        return entry.varType;
      }
      case "unary": {
        const t = visitExpr(node.operand);
        if (!t) return undefined;
        if (node.operator === "-") {
          if (!NUMERIC.has(t)) {
            error(`Unary '-' requires a numeric operand, found ${t}`, node);
            return undefined;
          }
          node.resolvedType = t;
          return t;
        }
        if (node.operator === "not") {
          if (t !== "bool") {
            error(`Unary 'not' requires a bool operand, found ${t}`, node);
            return undefined;
          }
          node.resolvedType = "bool";
          return "bool";
        }
        return t;
      }
      case "binary":
        return visitBinary(node);
      case "call":
        return visitCall(node);
      case "list": {
        const types = node.elements.map((e) => visitExpr(e));
        const known = types.filter((t): t is string => !!t);
        const first = known[0] ?? "unknown";
        const homog = known.every((t) => compatible(first, t));
        const t = asListType(homog ? first : "unknown");
        node.resolvedType = t;
        emitCheck(true, `List literal ${t}`, node.loc.line, node.loc.column);
        return t;
      }
      case "index": {
        const tt = visitExpr(node.target);
        const it = visitExpr(node.index);
        if (it && it !== "int") error(`List index must be int, found ${it}`, node);
        const elem = listElemType(tt ?? "");
        if (!elem && tt !== "string") {
          if (tt) error(`Cannot index type ${tt}`, node);
          return undefined;
        }
        const resolved = tt === "string" ? "string" : elem;
        node.resolvedType = resolved;
        return resolved;
      }
    }
  }

  function visitBinary(node: Extract<Expr, { kind: "binary" }>): string | undefined {
    const lt = visitExpr(node.left);
    const rt = visitExpr(node.right);
    if (!lt || !rt) return undefined;
    const op = node.operator;

    if (op === "and" || op === "or") {
      if (lt !== "bool" || rt !== "bool") {
        error(`Operator '${op}' requires bool operands, found ${lt} and ${rt}`, node);
        return undefined;
      }
      emitCheck(true, `Logical '${op}' operand types valid`, node.loc.line, node.loc.column);
      node.resolvedType = "bool";
      return "bool";
    }

    if (COMPARISON.has(op)) {
      if (!compatible(lt, rt)) {
        error(`Type mismatch in comparison: ${lt} ${op} ${rt}`, node);
        return undefined;
      }
      if ((op === "<" || op === ">" || op === "<=" || op === ">=") && !(NUMERIC.has(lt) && NUMERIC.has(rt))) {
        error(`Ordered comparison requires numeric operands, found ${lt} and ${rt}`, node);
        return undefined;
      }
      emitCheck(true, `Comparison '${op}' has compatible operand types`, node.loc.line, node.loc.column);
      node.resolvedType = "bool";
      return "bool";
    }

    if (ARITH.has(op)) {
      if (op === "+" && lt === "string" && rt === "string") {
        emitCheck(true, "String concatenation types valid", node.loc.line, node.loc.column);
        node.resolvedType = "string";
        return "string";
      }
      if (!NUMERIC.has(lt) || !NUMERIC.has(rt)) {
        error(`Operator '${op}' requires numeric operands, found ${lt} and ${rt}`, node);
        return undefined;
      }
      const result = lt === "float" || rt === "float" ? "float" : "int";
      emitCheck(true, `Arithmetic '${op}' operand types valid (${result})`, node.loc.line, node.loc.column);
      node.resolvedType = result;
      return result;
    }

    error(`Unknown operator '${op}'`, node);
    return undefined;
  }

  function visitCall(node: Extract<Expr, { kind: "call" }>): string | undefined {
    if (node.callee.kind === "identifier" && node.callee.name === "input") {
      if (node.args.length !== 0) error("input() takes no arguments", node);
      node.resolvedType = "string";
      return "string";
    }
    if (node.callee.kind === "identifier" && node.callee.name === "print") {
      for (const a of node.args) visitExpr(a);
      node.resolvedType = "void";
      return "void";
    }
    const calleeType = visitExpr(node.callee);
    const argTypes = node.args.map((a) => visitExpr(a));
    const parsed = parseFnType(calleeType);
    if (!parsed) {
      if (calleeType) error(`Cannot call value of type ${calleeType}`, node);
      return undefined;
    }
    if (parsed.params.length !== argTypes.length) {
      error(
        `Function expected ${parsed.params.length} argument(s), got ${argTypes.length}`,
        node,
      );
    } else {
      parsed.params.forEach((p, i) => {
        const a = argTypes[i];
        if (a && !compatible(p, a)) {
          error(`Argument ${i + 1}: expected ${p}, found ${a}`, node);
        }
      });
      emitCheck(true, "Call argument types valid", node.loc.line, node.loc.column);
    }
    node.resolvedType = parsed.ret;
    return parsed.ret;
  }

  for (const stmt of program.statements) visitStmt(stmt);
  return { symbols, checks, errors };
}

function parseFnType(t: string | undefined): { params: string[]; ret: string } | null {
  if (!t) return null;
  const m = /^fn\((.*)\)->(.+)$/.exec(t);
  if (!m) return null;
  const params = m[1] ? m[1].split(",").filter(Boolean) : [];
  return { params, ret: m[2]! };
}

function literalValue(expr: Expr): unknown {
  if (expr.kind === "literal") return expr.value;
  return null;
}
