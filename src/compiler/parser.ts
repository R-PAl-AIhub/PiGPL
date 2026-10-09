import {
  locOf,
  newAstId,
  resetAstIds,
  type ASTNode,
  type Expr,
  type FnStmt,
  type Param,
  type Program,
  type Stmt,
} from "./ast.ts";
import { EventLog } from "./events.ts";
import type { CompilerError, SourceLoc, Token } from "./types.ts";

const EOF: Token = {
  type: "EOF",
  lexeme: "",
  value: "",
  line: 0,
  column: 0,
  start: 0,
  end: 0,
  eventId: 0,
};

const STMT_START = new Set([
  "LET",
  "IF",
  "WHILE",
  "FOR",
  "FN",
  "RETURN",
  "PRINT",
  "IDENTIFIER",
  "RBRACE",
  "EOF",
]);

export function parse(
  tokens: Token[],
  log?: EventLog,
): { ast: Program | null; errors: CompilerError[] } {
  resetAstIds();
  const errors: CompilerError[] = [];
  let pos = 0;

  const peek = (offset = 0): Token => tokens[pos + offset] ?? EOF;
  const at = (...types: string[]) => types.includes(peek().type);

  const tokenLoc = (t: Token): SourceLoc =>
    locOf(t.line, t.column, t.start, t.end);

  const span = (start: SourceLoc, end?: SourceLoc): SourceLoc =>
    locOf(start.line, start.column, start.start, end?.end ?? start.end);

  const errorAt = (t: Token, message: string) => {
    const err: CompilerError = {
      phase: "Syntax",
      message,
      line: t.line || 1,
      column: t.column || 1,
      start: t.start,
      end: t.end,
    };
    errors.push(err);
    log?.emit("parser", "error", message, tokenLoc(t));
  };

  const advance = (): Token => {
    const t = peek();
    if (t.type !== "EOF") {
      pos += 1;
      log?.emit("parser", "consume", `consume ${t.type} ‘${t.lexeme}’`, tokenLoc(t), {
        type: t.type,
        lexeme: t.lexeme,
      });
    }
    return t;
  };

  const expect = (type: string, message?: string): Token => {
    if (at(type)) return advance();
    errorAt(peek(), message ?? `Expected ${type}, found ${peek().type || "end of input"}`);
    return peek();
  };

  const skipToStmt = () => {
    while (!at("EOF") && !STMT_START.has(peek().type)) advance();
  };

  const mark = (node: ASTNode, production: string) => {
    const event = log?.emit("parser", "reduce", production, node.loc, {
      kind: node.kind,
      id: node.id,
    });
    node.eventId = event?.id ?? node.id;
    log?.emit("ast", "node", nodeLabelSafe(node), node.loc, {
      kind: node.kind,
      id: node.id,
    });
    return node;
  };

  function parseProgram(): Program {
    const statements: Stmt[] = [];
    while (!at("EOF")) {
      const before = pos;
      const stmt = parseStatement();
      if (stmt) statements.push(stmt);
      else skipToStmt();
      if (pos === before) {
        if (at("EOF")) break;
        errorAt(peek(), `Unexpected token '${peek().lexeme}' (${peek().type})`);
        advance();
      }
    }
    const program: Program = {
      id: newAstId(),
      kind: "program",
      statements,
      loc: locOf(1, 1, 0, tokens[tokens.length - 1]?.end ?? 0),
      eventId: 0,
    };
    return mark(program, "program → statement*") as Program;
  }

  function parseStatement(): Stmt | null {
    if (at("LET")) return parseDeclaration();
    if (at("IF")) return parseIf();
    if (at("WHILE")) return parseWhile();
    if (at("FOR")) return parseFor();
    if (at("FN")) return parseFn();
    if (at("RETURN")) return parseReturn();
    if (at("PRINT")) return parsePrint();
    if (at("IDENTIFIER")) {
      if (peek(1).type === "ASSIGN") return parseAssignment();
      if (peek(1).type === "LBRACKET") return parseIndexAssignOrExpr();
      if (peek(1).type === "LPAREN") return parseExprStmt();
      errorAt(peek(), `Unexpected identifier '${peek().lexeme}' — expected assignment or call`);
      advance();
      return null;
    }
    if (at("EOF") || at("RBRACE")) return null;
    errorAt(
      peek(),
      peek().type === "EOF"
        ? "Unexpected end of input; a statement or expression was incomplete."
        : `Unexpected token '${peek().lexeme}' (${peek().type})`,
    );
    if (!at("EOF")) advance();
    return null;
  }

  function parseDeclaration(): Stmt {
    const letTok = expect("LET");
    const nameTok = expect("IDENTIFIER", "Expected identifier after let");
    expect("COLON", "Expected ':' after identifier in declaration");
    const typeTok = expect("TYPE", "Expected a type (int, float, bool, string, list)");
    expect("ASSIGN", "Expected '=' in declaration");
    const value = parseExpression();
    const node: Stmt = {
      id: newAstId(),
      kind: "declaration",
      name: String(nameTok.lexeme),
      varType: String(typeTok.lexeme),
      value,
      loc: span(tokenLoc(letTok), value.loc),
      eventId: 0,
    };
    return mark(node, `declaration → let ${nameTok.lexeme} : ${typeTok.lexeme} = expr`) as Stmt;
  }

  function parseAssignment(): Stmt {
    const nameTok = expect("IDENTIFIER");
    expect("ASSIGN");
    const value = parseExpression();
    const node: Stmt = {
      id: newAstId(),
      kind: "assignment",
      name: String(nameTok.lexeme),
      value,
      loc: span(tokenLoc(nameTok), value.loc),
      eventId: 0,
    };
    return mark(node, `assignment → ${nameTok.lexeme} = expr`) as Stmt;
  }

  function parseIndexAssignOrExpr(): Stmt {
    const startTok = peek();
    const expr = parseExpression();
    if (at("ASSIGN") && expr.kind === "index") {
      advance();
      const value = parseExpression();
      const node: Stmt = {
        id: newAstId(),
        kind: "index-assign",
        target: expr.target,
        index: expr.index,
        value,
        loc: span(tokenLoc(startTok), value.loc),
        eventId: 0,
      };
      return mark(node, "assignment → expr[index] = expr") as Stmt;
    }
    const node: Stmt = {
      id: newAstId(),
      kind: "expr-stmt",
      expression: expr,
      loc: expr.loc,
      eventId: 0,
    };
    return mark(node, "statement → expression") as Stmt;
  }

  function parseExprStmt(): Stmt {
    const expr = parseExpression();
    const node: Stmt = {
      id: newAstId(),
      kind: "expr-stmt",
      expression: expr,
      loc: expr.loc,
      eventId: 0,
    };
    return mark(node, "statement → expression") as Stmt;
  }

  function parsePrint(): Stmt {
    const tok = expect("PRINT");
    expect("LPAREN");
    const expression = parseExpression();
    expect("RPAREN");
    const node: Stmt = {
      id: newAstId(),
      kind: "print",
      expression,
      loc: span(tokenLoc(tok), expression.loc),
      eventId: 0,
    };
    return mark(node, "print_stmt → print ( expr )") as Stmt;
  }

  function parseBlock(): Stmt[] {
    expect("LBRACE");
    const body: Stmt[] = [];
    while (!at("RBRACE") && !at("EOF")) {
      const stmt = parseStatement();
      if (stmt) body.push(stmt);
      else skipToStmt();
    }
    expect("RBRACE", "Expected '}' to close block");
    return body;
  }

  function parseIf(): Stmt {
    const tok = expect("IF");
    const condition = parseExpression();
    const thenBlock = parseBlock();
    const elifs: { condition: Expr; block: Stmt[] }[] = [];
    while (at("ELIF")) {
      advance();
      const cond = parseExpression();
      const block = parseBlock();
      elifs.push({ condition: cond, block });
    }
    let elseBlock: Stmt[] | null = null;
    if (at("ELSE")) {
      advance();
      elseBlock = parseBlock();
    }
    const node: Stmt = {
      id: newAstId(),
      kind: "if",
      condition,
      thenBlock,
      elifs,
      elseBlock,
      loc: tokenLoc(tok),
      eventId: 0,
    };
    return mark(node, "if_stmt → if expr block (elif expr block)* (else block)?") as Stmt;
  }

  function parseWhile(): Stmt {
    const tok = expect("WHILE");
    const condition = parseExpression();
    const body = parseBlock();
    const node: Stmt = {
      id: newAstId(),
      kind: "while",
      condition,
      body,
      loc: tokenLoc(tok),
      eventId: 0,
    };
    return mark(node, "while_stmt → while expr block") as Stmt;
  }

  function parseFor(): Stmt {
    const tok = expect("FOR");
    const nameTok = expect("IDENTIFIER", "Expected loop variable after for");
    expect("IN", "Expected 'in' in for-loop");
    const iterable = parseExpression();
    const body = parseBlock();
    const node: Stmt = {
      id: newAstId(),
      kind: "for",
      iterator: String(nameTok.lexeme),
      iterable,
      body,
      loc: tokenLoc(tok),
      eventId: 0,
    };
    return mark(node, `for_stmt → for ${nameTok.lexeme} in expr block`) as Stmt;
  }

  function parseFn(): Stmt {
    const tok = expect("FN");
    const nameTok = expect("IDENTIFIER", "Expected function name");
    expect("LPAREN");
    const params: Param[] = [];
    if (!at("RPAREN")) {
      params.push(parseParam());
      while (at("COMMA")) {
        advance();
        params.push(parseParam());
      }
    }
    expect("RPAREN");
    let returnType = "void";
    if (at("ARROW")) {
      advance();
      const t = expect("TYPE", "Expected return type after '->'");
      returnType = String(t.lexeme);
    }
    const body = parseBlock();
    const node: FnStmt = {
      id: newAstId(),
      kind: "fn",
      name: String(nameTok.lexeme),
      params,
      returnType,
      body,
      loc: tokenLoc(tok),
      eventId: 0,
    };
    return mark(node, `fn → fn ${nameTok.lexeme}(...) block`) as Stmt;
  }

  function parseParam(): Param {
    const nameTok = expect("IDENTIFIER", "Expected parameter name");
    expect("COLON", "Expected ':' after parameter name");
    const typeTok = expect("TYPE", "Expected parameter type");
    return {
      name: String(nameTok.lexeme),
      type: String(typeTok.lexeme),
      loc: tokenLoc(nameTok),
    };
  }

  function parseReturn(): Stmt {
    const tok = expect("RETURN");
    let value: Expr | null = null;
    if (
      at(
        "IDENTIFIER",
        "INTEGER",
        "FLOATNUM",
        "STRING",
        "TRUE",
        "FALSE",
        "LPAREN",
        "LBRACKET",
        "NOT",
        "MINUS",
        "INPUT",
      )
    ) {
      value = parseExpression();
    }
    const node: Stmt = {
      id: newAstId(),
      kind: "return",
      value,
      loc: tokenLoc(tok),
      eventId: 0,
    };
    return mark(node, "return_stmt → return expr?") as Stmt;
  }

  function parseExpression(): Expr {
    return parseOr();
  }

  function parseOr(): Expr {
    let left = parseAnd();
    while (at("OR")) {
      const op = advance();
      const right = parseAnd();
      left = bin(left, String(op.lexeme), right);
    }
    return left;
  }

  function parseAnd(): Expr {
    let left = parseNot();
    while (at("AND")) {
      const op = advance();
      const right = parseNot();
      left = bin(left, String(op.lexeme), right);
    }
    return left;
  }

  function parseNot(): Expr {
    if (at("NOT")) {
      const op = advance();
      const operand = parseNot();
      const node: Expr = {
        id: newAstId(),
        kind: "unary",
        operator: "not",
        operand,
        loc: span(tokenLoc(op), operand.loc),
        eventId: 0,
      };
      return mark(node, "unary → not unary") as Expr;
    }
    return parseComparison();
  }

  function parseComparison(): Expr {
    let left = parseTerm();
    while (at("EQ", "NEQ", "LT", "GT", "LE", "GE")) {
      const op = advance();
      const right = parseTerm();
      left = bin(left, String(op.lexeme), right);
    }
    return left;
  }

  function parseTerm(): Expr {
    let left = parseFactor();
    while (at("PLUS", "MINUS")) {
      const op = advance();
      const right = parseFactor();
      left = bin(left, String(op.lexeme), right);
    }
    return left;
  }

  function parseFactor(): Expr {
    let left = parseUnary();
    while (at("TIMES", "DIVIDE", "MODULO")) {
      const op = advance();
      const right = parseUnary();
      left = bin(left, String(op.lexeme), right);
    }
    return left;
  }

  function parseUnary(): Expr {
    if (at("MINUS")) {
      const op = advance();
      const operand = parseUnary();
      const node: Expr = {
        id: newAstId(),
        kind: "unary",
        operator: "-",
        operand,
        loc: span(tokenLoc(op), operand.loc),
        eventId: 0,
      };
      return mark(node, "unary → - unary") as Expr;
    }
    return parsePostfix();
  }

  function parsePostfix(): Expr {
    let expr = parsePrimary();
    for (;;) {
      if (at("LPAREN")) {
        advance();
        const args: Expr[] = [];
        if (!at("RPAREN")) {
          args.push(parseExpression());
          while (at("COMMA")) {
            advance();
            args.push(parseExpression());
          }
        }
        const end = expect("RPAREN");
        const node: Expr = {
          id: newAstId(),
          kind: "call",
          callee: expr,
          args,
          loc: span(expr.loc, tokenLoc(end)),
          eventId: 0,
        };
        expr = mark(node, "call → expr ( args )") as Expr;
      } else if (at("LBRACKET")) {
        advance();
        const index = parseExpression();
        const end = expect("RBRACKET");
        const node: Expr = {
          id: newAstId(),
          kind: "index",
          target: expr,
          index,
          loc: span(expr.loc, tokenLoc(end)),
          eventId: 0,
        };
        expr = mark(node, "index → expr [ expr ]") as Expr;
      } else {
        break;
      }
    }
    return expr;
  }

  function parsePrimary(): Expr {
    if (at("INTEGER")) {
      const t = advance();
      const node: Expr = {
        id: newAstId(),
        kind: "literal",
        value: Number(t.value),
        literalType: "int",
        loc: tokenLoc(t),
        eventId: 0,
      };
      return mark(node, `primary → ${t.lexeme}`) as Expr;
    }
    if (at("FLOATNUM")) {
      const t = advance();
      const node: Expr = {
        id: newAstId(),
        kind: "literal",
        value: Number(t.value),
        literalType: "float",
        loc: tokenLoc(t),
        eventId: 0,
      };
      return mark(node, `primary → ${t.lexeme}`) as Expr;
    }
    if (at("STRING")) {
      const t = advance();
      const node: Expr = {
        id: newAstId(),
        kind: "literal",
        value: String(t.value),
        literalType: "string",
        loc: tokenLoc(t),
        eventId: 0,
      };
      return mark(node, `primary → string`) as Expr;
    }
    if (at("TRUE", "FALSE")) {
      const t = advance();
      const node: Expr = {
        id: newAstId(),
        kind: "literal",
        value: t.type === "TRUE",
        literalType: "bool",
        loc: tokenLoc(t),
        eventId: 0,
      };
      return mark(node, `primary → ${t.lexeme}`) as Expr;
    }
    if (at("IDENTIFIER", "INPUT")) {
      const t = advance();
      const node: Expr = {
        id: newAstId(),
        kind: "identifier",
        name: String(t.lexeme),
        loc: tokenLoc(t),
        eventId: 0,
      };
      return mark(node, `primary → ${t.lexeme}`) as Expr;
    }
    if (at("LPAREN")) {
      advance();
      const inner = parseExpression();
      expect("RPAREN");
      return inner;
    }
    if (at("LBRACKET")) {
      const t = advance();
      const elements: Expr[] = [];
      if (!at("RBRACKET")) {
        elements.push(parseExpression());
        while (at("COMMA")) {
          advance();
          elements.push(parseExpression());
        }
      }
      const end = expect("RBRACKET");
      const node: Expr = {
        id: newAstId(),
        kind: "list",
        elements,
        loc: span(tokenLoc(t), tokenLoc(end)),
        eventId: 0,
      };
      return mark(node, "primary → [ list ]") as Expr;
    }

    errorAt(
      peek(),
      peek().type === "EOF"
        ? "Unexpected end of input; a statement or expression was incomplete."
        : `Unexpected token '${peek().lexeme}' (${peek().type})`,
    );
    const dummy: Expr = {
      id: newAstId(),
      kind: "literal",
      value: 0,
      literalType: "int",
      loc: tokenLoc(peek()),
      eventId: 0,
    };
    dummy.eventId = dummy.id;
    return dummy;
  }

  function bin(left: Expr, operator: string, right: Expr): Expr {
    const node: Expr = {
      id: newAstId(),
      kind: "binary",
      operator,
      left,
      right,
      loc: span(left.loc, right.loc),
      eventId: 0,
    };
    return mark(node, `expr → expr ${operator} expr`) as Expr;
  }

  const ast = parseProgram();
  if (errors.length > 0 && ast.statements.length === 0) {
    return { ast: null, errors };
  }
  return { ast, errors };
}

function nodeLabelSafe(node: ASTNode): string {
  if ("name" in node && typeof (node as { name?: string }).name === "string") {
    return `${node.kind} ${(node as { name: string }).name}`;
  }
  if (node.kind === "binary") return `binary ${node.operator}`;
  if (node.kind === "literal") return `literal ${String(node.value)}`;
  return node.kind;
}
