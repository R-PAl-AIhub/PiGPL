import type { CompilerError, Token } from "./types.ts";
import { EventLog } from "./events.ts";
import { locOf } from "./ast.ts";

export const KEYWORDS: Record<string, string> = {
  let: "LET",
  int: "TYPE",
  float: "TYPE",
  bool: "TYPE",
  string: "TYPE",
  list: "TYPE",
  if: "IF",
  elif: "ELIF",
  else: "ELSE",
  for: "FOR",
  while: "WHILE",
  in: "IN",
  fn: "FN",
  return: "RETURN",
  print: "PRINT",
  input: "INPUT",
  true: "TRUE",
  false: "FALSE",
  and: "AND",
  or: "OR",
  not: "NOT",
};

const TWO_CHAR: Record<string, string> = {
  "==": "EQ",
  "!=": "NEQ",
  "<=": "LE",
  ">=": "GE",
  "->": "ARROW",
};

const ONE_CHAR: Record<string, string> = {
  "+": "PLUS",
  "-": "MINUS",
  "*": "TIMES",
  "/": "DIVIDE",
  "%": "MODULO",
  "=": "ASSIGN",
  "<": "LT",
  ">": "GT",
  "(": "LPAREN",
  ")": "RPAREN",
  "{": "LBRACE",
  "}": "RBRACE",
  "[": "LBRACKET",
  "]": "RBRACKET",
  ",": "COMMA",
  ":": "COLON",
};

function isIdentStart(ch: string) {
  return /[A-Za-z_]/.test(ch);
}

function isIdentPart(ch: string) {
  return /[A-Za-z0-9_]/.test(ch);
}

function isDigit(ch: string) {
  return ch >= "0" && ch <= "9";
}

export function tokenize(
  source: string,
  log?: EventLog,
): { tokens: Token[]; errors: CompilerError[] } {
  const tokens: Token[] = [];
  const errors: CompilerError[] = [];
  let i = 0;
  let line = 1;
  let column = 1;

  const advance = () => {
    if (source[i] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
    i += 1;
  };

  const emitToken = (
    type: string,
    lexeme: string,
    value: string | number | boolean,
    start: number,
    end: number,
    tokLine: number,
    tokCol: number,
  ) => {
    const event = log?.emit(
      "lexer",
      "token",
      `${type}  ${lexeme}`,
      locOf(tokLine, tokCol, start, end),
      { type, lexeme },
    );
    tokens.push({
      type,
      lexeme,
      value,
      line: tokLine,
      column: tokCol,
      start,
      end,
      eventId: event?.id ?? tokens.length + 1,
    });
  };

  while (i < source.length) {
    const ch = source[i]!;

    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
      advance();
      continue;
    }

    if (ch === "#") {
      while (i < source.length && source[i] !== "\n") advance();
      continue;
    }

    const start = i;
    const tokLine = line;
    const tokCol = column;

    if (isDigit(ch)) {
      while (i < source.length && isDigit(source[i]!)) advance();
      if (source[i] === "." && isDigit(source[i + 1] ?? "")) {
        advance();
        while (i < source.length && isDigit(source[i]!)) advance();
        const lexeme = source.slice(start, i);
        emitToken("FLOATNUM", lexeme, Number(lexeme), start, i, tokLine, tokCol);
      } else {
        const lexeme = source.slice(start, i);
        emitToken("INTEGER", lexeme, Number(lexeme), start, i, tokLine, tokCol);
      }
      continue;
    }

    if (ch === '"') {
      advance();
      let value = "";
      let closed = false;
      while (i < source.length) {
        const c = source[i]!;
        if (c === '"') {
          advance();
          closed = true;
          break;
        }
        if (c === "\\") {
          advance();
          const esc = source[i];
          if (esc === "n") value += "\n";
          else if (esc === "t") value += "\t";
          else if (esc === '"') value += '"';
          else if (esc === "\\") value += "\\";
          else value += esc ?? "";
          if (i < source.length) advance();
          continue;
        }
        if (c === "\n") break;
        value += c;
        advance();
      }
      const lexeme = source.slice(start, i);
      if (!closed) {
        const err: CompilerError = {
          phase: "Lexical",
          message: "Unterminated string literal",
          line: tokLine,
          column: tokCol,
          start,
          end: i,
        };
        errors.push(err);
        log?.emit("lexer", "error", err.message, locOf(tokLine, tokCol, start, i));
      } else {
        emitToken("STRING", lexeme, value, start, i, tokLine, tokCol);
      }
      continue;
    }

    if (isIdentStart(ch)) {
      while (i < source.length && isIdentPart(source[i]!)) advance();
      const lexeme = source.slice(start, i);
      const type = KEYWORDS[lexeme] ?? "IDENTIFIER";
      let value: string | number | boolean = lexeme;
      if (type === "TRUE") value = true;
      if (type === "FALSE") value = false;
      emitToken(type, lexeme, value, start, i, tokLine, tokCol);
      continue;
    }

    const two = source.slice(i, i + 2);
    if (TWO_CHAR[two]) {
      advance();
      advance();
      emitToken(TWO_CHAR[two]!, two, two, start, i, tokLine, tokCol);
      continue;
    }

    if (ONE_CHAR[ch]) {
      advance();
      emitToken(ONE_CHAR[ch]!, ch, ch, start, i, tokLine, tokCol);
      continue;
    }

    const err: CompilerError = {
      phase: "Lexical",
      message: `Invalid character '${ch}'`,
      line: tokLine,
      column: tokCol,
      start,
      end: start + 1,
    };
    errors.push(err);
    log?.emit("lexer", "error", err.message, locOf(tokLine, tokCol, start, start + 1), {
      char: ch,
    });
    advance();
  }

  return { tokens, errors };
}
