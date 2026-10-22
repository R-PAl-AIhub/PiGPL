import type { Expr, FnStmt, Program, Stmt } from "./ast.ts";
import { EventLog } from "./events.ts";
import { SymbolTable } from "./symbol-table.ts";
import type { CompilerError, SemanticCheck } from "./types.ts";

const NUMERIC = new Set(["int", "float"]);
const COMPARISON = new Set(["==", "!=", "<", ">", "<=", ">="]);
const ORDERED = new Set(["<", ">", "<=", ">="]);
const ARITH = new Set(["+", "-", "*", "/", "%"]);

/**
 * The type of a value the compiler cannot see, such as an item of a plain `list`.
 * It matches every type here, and the executor checks the real types when the program runs.
 */
const UNKNOWN = "unknown";

const numericOrUnknown = (t: string) => NUMERIC.has(t) || t === UNKNOWN;

function listElemType(t: string | undefined): string | undefined {
  if (!t) return undefined;
  const m = /^list\[(.+)\]$/.exec(t);
  return m ? m[1] : t === "list" ? UNKNOWN : undefined;
}

function asListType(elem: string) {
  return elem === UNKNOWN ? "list" : `list[${elem}]`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Edit distance between two names, giving up (and returning max + 1) once it passes `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost);
      best = Math.min(best, row[j]!);
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length]!;
}

/** The declared name that is closest to a misspelled one, if any is close enough to be a likely typo. */
function closestName(name: string, candidates: string[]): string | undefined {
  if (name.length < 3) return undefined;
  const max = name.length >= 4 ? 2 : 1;
  let best: string | undefined;
  let bestDistance = max + 1;
  for (const candidate of candidates) {
    if (candidate === name) continue;
    const d = editDistance(name, candidate, max);
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return best;
}

/** True when every path through these statements ends in a `return`. A loop never counts. */
function alwaysReturns(stmts: Stmt[]): boolean {
  return stmts.some((s) => {
    if (s.kind === "return") return true;
    if (s.kind === "if") {
      return (
        s.elseBlock !== null &&
        alwaysReturns(s.thenBlock) &&
        s.elifs.every((e) => alwaysReturns(e.block)) &&
        alwaysReturns(s.elseBlock)
      );
    }
    return false;
  });
}

export function analyze(
  program: Program,
  log?: EventLog,
): { symbols: SymbolTable; checks: SemanticCheck[]; errors: CompilerError[] } {
  const symbols = new SymbolTable();
  const checks: SemanticCheck[] = [];
  const errors: CompilerError[] = [];
  const fnStack: { name: string; returnType: string }[] = [];
  /** How many if/while/for/fn bodies enclose the statement being visited. */
  let nesting = 0;
  const duplicateFns = new Set<FnStmt>();

  function emitCheck(ok: boolean, message: string, line = 0, column = 0) {
    const event = log?.emit("semantic", ok ? "check" : "fail", message, {
      line,
      column,
      start: 0,
      end: 0,
    });
    checks.push({ ok, message, eventId: event?.id ?? checks.length + 1, line, column });
  }

  function error(
    message: string,
    node: { loc: { line: number; column: number; start?: number; end?: number } },
  ) {
    const err: CompilerError = {
      phase: "Semantic",
      message,
      line: node.loc.line,
      column: node.loc.column,
      start: node.loc.start,
      end: node.loc.end,
    };
    errors.push(err);
    log?.emit("semantic", "error", message, {
      line: node.loc.line,
      column: node.loc.column,
      start: node.loc.start ?? 0,
      end: node.loc.end ?? 0,
    });
    emitCheck(false, message, node.loc.line, node.loc.column);
  }

  /** Same type, or types that can be compared or mixed (an int and a float, or an unknown). */
  function compatible(declared: string, actual: string) {
    if (declared === actual) return true;
    if (declared === UNKNOWN || actual === UNKNOWN) return true;
    if (NUMERIC.has(declared) && NUMERIC.has(actual)) return true;
    if (declared === "list" && actual.startsWith("list")) return true;
    if (actual === "list" && declared.startsWith("list")) return true;
    const de = listElemType(declared);
    const ae = listElemType(actual);
    if (de && ae && (de === ae || de === UNKNOWN || ae === UNKNOWN)) return true;
    return false;
  }

  /** Can a value of type `actual` be stored where `declared` is expected? An int fits a float, but a float does not fit an int. */
  function assignable(declared: string, actual: string) {
    if (declared === "int" && actual === "float") return false;
    return compatible(declared, actual);
  }

  const mismatchNote = (expected: string, found: string) =>
    expected === "int" && found === "float"
      ? " (an int cannot hold a decimal value; declare it as float)"
      : "";

  function undeclared(name: string): string {
    const guess = closestName(name, symbols.visibleNames());
    return guess
      ? `Undeclared identifier: ${name} (did you mean '${guess}'?)`
      : `Undeclared identifier: ${name}`;
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
      case "print": {
        const t = visitExpr(stmt.expression);
        if (t === "void") {
          error("print() needs a value, but this function call returns nothing", stmt);
        } else {
          emitCheck(true, "print() argument is a valid expression", stmt.loc.line, stmt.loc.column);
        }
        break;
      }
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

  /** Visit the statements of a body that sits one level deeper. */
  function visitBody(stmts: Stmt[]) {
    nesting += 1;
    for (const s of stmts) visitStmt(s);
    nesting -= 1;
  }

  function visitDeclaration(stmt: Extract<Stmt, { kind: "declaration" }>) {
    if (symbols.lookupInCurrent(stmt.name)) {
      error(`Identifier '${stmt.name}' is already declared`, stmt);
      return;
    }
    const valueType = visitExpr(stmt.value);
    emitCheck(true, `Declaration valid: let ${stmt.name} : ${stmt.varType}`, stmt.loc.line, stmt.loc.column);
    if (valueType && !assignable(stmt.varType, valueType)) {
      error(
        `Type mismatch in declaration of '${stmt.name}': expected ${stmt.varType}, found ${valueType}${mismatchNote(stmt.varType, valueType)}`,
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
      error(undeclared(stmt.name), stmt);
      visitExpr(stmt.value);
      return;
    }
    if (entry.kind === "fn") {
      error(`Cannot assign to function '${stmt.name}'`, stmt);
      return;
    }
    emitCheck(true, `Identifier declared: '${stmt.name}'`, stmt.loc.line, stmt.loc.column);
    const valueType = visitExpr(stmt.value);
    if (valueType && !assignable(entry.varType, valueType)) {
      error(
        `Type mismatch in assignment to '${stmt.name}': expected ${entry.varType}, found ${valueType}${mismatchNote(entry.varType, valueType)}`,
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
    if (indexType && indexType !== "int" && indexType !== UNKNOWN) {
      error(`List index must be int, found ${indexType}`, stmt);
    }
    // The target already failed and was reported; do not add a second error about it.
    if (!targetType) return;
    // m[0][1] = 5 would change a temporary copy of m[0] and lose the change, so refuse it.
    if (stmt.target.kind !== "identifier") {
      error(
        "Only a list variable can be changed by index, as in xs[0] = 1. Changing an item inside a nested list, as in m[0][1] = 1, is not supported",
        stmt,
      );
      return;
    }
    const elem = targetType === UNKNOWN ? UNKNOWN : listElemType(targetType);
    if (!elem) {
      error("Indexed assignment requires a list", stmt);
      return;
    }
    if (valueType && elem !== UNKNOWN && !assignable(elem, valueType)) {
      error(`Type mismatch in list assignment: expected ${elem}, found ${valueType}`, stmt);
    }
  }

  function visitIf(stmt: Extract<Stmt, { kind: "if" }>) {
    checkCondition(visitExpr(stmt.condition), stmt.condition);
    visitBody(stmt.thenBlock);
    for (const el of stmt.elifs) {
      checkCondition(visitExpr(el.condition), el.condition);
      visitBody(el.block);
    }
    if (stmt.elseBlock) visitBody(stmt.elseBlock);
  }

  function visitWhile(stmt: Extract<Stmt, { kind: "while" }>) {
    checkCondition(visitExpr(stmt.condition), stmt.condition);
    visitBody(stmt.body);
  }

  function visitFor(stmt: Extract<Stmt, { kind: "for" }>) {
    const iterType = visitExpr(stmt.iterable);
    let elemType = "int";
    if (iterType === "int") elemType = "int";
    else if (iterType === UNKNOWN) elemType = UNKNOWN;
    else if (iterType && (iterType === "list" || iterType.startsWith("list"))) {
      elemType = listElemType(iterType) ?? UNKNOWN;
    } else if (iterType === "string") {
      elemType = "string";
    } else if (iterType) {
      error(`Cannot iterate over type ${iterType} (use a whole number, a list or a string)`, stmt);
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
    visitBody(stmt.body);
    symbols.exitScope();
    log?.emit("semantic", "scope", `exit loop ${stmt.iterator}`, stmt.loc);
  }

  /** Put a top-level function in the symbol table. Done before any body is visited. */
  function declareFn(stmt: FnStmt) {
    if (symbols.lookupInCurrent(stmt.name)) {
      error(`Identifier '${stmt.name}' is already declared`, stmt);
      duplicateFns.add(stmt);
      return;
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
  }

  function visitFn(stmt: FnStmt) {
    // The IR and the executor place functions before the main program, so a function
    // cannot be defined inside another function, a loop or an if.
    if (nesting > 0) {
      error(
        "Functions can only be defined at the top level of the program, not inside another function, loop or if",
        stmt,
      );
      // Still record the name, so a later call to it does not raise a second, misleading error.
      declareFn(stmt);
      return;
    }
    if (duplicateFns.has(stmt)) return;
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
    fnStack.push({ name: stmt.name, returnType: stmt.returnType });
    visitBody(stmt.body);
    fnStack.pop();
    if (stmt.returnType !== "void" && !alwaysReturns(stmt.body)) {
      error(
        `Function '${stmt.name}' must return a value of type ${stmt.returnType} on every path (add a 'return' at the end)`,
        stmt,
      );
    }
    symbols.exitScope();
    log?.emit("semantic", "scope", `exit ${stmt.name}`, stmt.loc);
  }

  function visitReturn(stmt: Extract<Stmt, { kind: "return" }>) {
    const fn = fnStack[fnStack.length - 1];
    if (fn === undefined) {
      error("return outside of a function", stmt);
      return;
    }
    const expected = fn.returnType;
    if (stmt.value) {
      const t = visitExpr(stmt.value);
      if (expected === "void") {
        error(
          `Function '${fn.name}' has no return type and cannot return a value (add '-> type' after the parameters)`,
          stmt,
        );
      } else if (t && !assignable(expected, t)) {
        error(`Return type mismatch: expected ${expected}, found ${t}${mismatchNote(expected, t)}`, stmt);
      } else {
        emitCheck(true, `Return type ${t} matches ${expected}`, stmt.loc.line, stmt.loc.column);
      }
    } else if (expected !== "void") {
      error(`Function '${fn.name}' must return a value of type ${expected}, but this return has no value`, stmt);
    }
  }

  function checkCondition(cond: string | undefined, node: { loc: { line: number; column: number } }) {
    if (!cond || cond === UNKNOWN) return;
    if (cond !== "bool") {
      error(`Condition must be bool, found ${cond} (use a comparison such as x > 0)`, node);
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
          error(undeclared(node.name), node);
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
          if (!numericOrUnknown(t)) {
            error(`Unary '-' requires a numeric operand, found ${t}`, node);
            return undefined;
          }
          node.resolvedType = t;
          return t;
        }
        if (node.operator === "not") {
          if (t !== "bool" && t !== UNKNOWN) {
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
        const first = known[0] ?? UNKNOWN;
        const homog = known.every((t) => compatible(first, t));
        const t = asListType(homog ? first : UNKNOWN);
        node.resolvedType = t;
        emitCheck(true, `List literal ${t}`, node.loc.line, node.loc.column);
        return t;
      }
      case "index": {
        const tt = visitExpr(node.target);
        const it = visitExpr(node.index);
        if (it && it !== "int" && it !== UNKNOWN) error(`List index must be int, found ${it}`, node);
        if (tt === UNKNOWN) {
          node.resolvedType = UNKNOWN;
          return UNKNOWN;
        }
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
      const notBool = (t: string) => t !== "bool" && t !== UNKNOWN;
      if (notBool(lt) || notBool(rt)) {
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
      if (ORDERED.has(op) && !(numericOrUnknown(lt) && numericOrUnknown(rt))) {
        error(`Ordered comparison requires numeric operands, found ${lt} and ${rt}`, node);
        return undefined;
      }
      emitCheck(true, `Comparison '${op}' has compatible operand types`, node.loc.line, node.loc.column);
      node.resolvedType = "bool";
      return "bool";
    }

    if (ARITH.has(op)) {
      if (lt === UNKNOWN || rt === UNKNOWN) {
        // One side is a value whose type is only known when the program runs, such as a list item.
        const other = lt === UNKNOWN ? rt : lt;
        const fits = other === UNKNOWN || NUMERIC.has(other) || (op === "+" && other === "string");
        if (!fits) {
          error(`Operator '${op}' requires numeric operands, found ${lt} and ${rt}`, node);
          return undefined;
        }
        emitCheck(
          true,
          `Operator '${op}' has an operand of unknown type; it is checked when the program runs`,
          node.loc.line,
          node.loc.column,
        );
        node.resolvedType = UNKNOWN;
        return UNKNOWN;
      }
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
      const who = node.callee.kind === "identifier" ? `Function '${node.callee.name}'` : "Function";
      error(
        `${who} expects ${plural(parsed.params.length, "argument")} but got ${argTypes.length}`,
        node,
      );
    } else {
      parsed.params.forEach((p, i) => {
        const a = argTypes[i];
        if (a && !assignable(p, a)) {
          error(`Argument ${i + 1}: expected ${p}, found ${a}${mismatchNote(p, a)}`, node);
        }
      });
      emitCheck(true, "Call argument types valid", node.loc.line, node.loc.column);
    }
    node.resolvedType = parsed.ret;
    return parsed.ret;
  }

  // Declare every top-level function first, so a call can come before the definition
  // and two functions can call each other.
  for (const stmt of program.statements) if (stmt.kind === "fn") declareFn(stmt);
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
