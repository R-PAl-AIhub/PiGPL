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

// Character classes use char codes: this runs once per source character, and a
// regex test per character was the slowest part of the lexer.
function isIdentStart(ch: string) {
  const c = ch.charCodeAt(0);
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
}

function isIdentPart(ch: string) {
  return isIdentStart(ch) || isDigit(ch);
}

function isDigit(ch: string) {
  return ch >= "0" && ch <= "9";
}

/** Why a character is invalid, for the characters people most often type by mistake. */
const CHAR_HINTS: Record<string, string> = {
  ".": "a decimal number needs digits on both sides of the point, for example 0.5",
  "'": 'strings use double quotes, for example "text"',
  "!": "use 'not' to negate a condition, or '!=' to compare two values",
  "&": "use 'and' to combine conditions",
  "|": "use 'or' to combine conditions",
  ";": "end a statement with a new line; PiGPL does not use a semicolon",
  "“": 'this is a curly quote; use straight double quotes " instead',
  "”": 'this is a curly quote; use straight double quotes " instead',
  "‘": 'this is a curly quote; strings use straight double quotes "',
  "’": 'this is a curly quote; strings use straight double quotes "',
  " ": "a non-breaking space; replace it with a normal space",
  "　": "a wide space; replace it with a normal space",
  "﻿": "an invisible byte-order mark; delete it",
};

/** The text that names a character in an error: the character itself when it is visible. */
function describeChar(ch: string): string {
  const cp = ch.codePointAt(0)!;
  const invisible = cp < 32 || cp === 127 || /\s/.test(ch);
  return invisible ? `U+${cp.toString(16).toUpperCase().padStart(4, "0")}` : `'${ch}'`;
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

  const lexError = (
    message: string,
    tokLine: number,
    tokCol: number,
    start: number,
    end: number,
    payload?: Record<string, unknown>,
  ) => {
    errors.push({ phase: "Lexical", message, line: tokLine, column: tokCol, start, end });
    log?.emit("lexer", "error", message, locOf(tokLine, tokCol, start, end), payload);
  };

  const shorten = (text: string) => (text.length > 24 ? `${text.slice(0, 20)}...` : text);

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
        const value = Number(lexeme);
        emitToken("FLOATNUM", lexeme, value, start, i, tokLine, tokCol);
        if (!Number.isFinite(value)) {
          lexError(`Number literal ${shorten(lexeme)} is too large to store`, tokLine, tokCol, start, i);
        }
      } else {
        const lexeme = source.slice(start, i);
        const value = Number(lexeme);
        emitToken("INTEGER", lexeme, value, start, i, tokLine, tokCol);
        // Past this size an int is no longer exact, so a wrong number would print silently.
        if (!Number.isSafeInteger(value)) {
          lexError(
            `Integer literal ${shorten(lexeme)} is too large (the largest int is ${Number.MAX_SAFE_INTEGER})`,
            tokLine,
            tokCol,
            start,
            i,
          );
        }
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
        lexError(
          'Unterminated string literal (add a closing " before the end of the line)',
          tokLine,
          tokCol,
          start,
          i,
        );
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

    // Take the whole code point: an emoji is two UTF-16 units and must be one error.
    const bad = String.fromCodePoint(source.codePointAt(i)!);
    const hint = CHAR_HINTS[bad];
    lexError(
      `Invalid character ${describeChar(bad)}${hint ? ` (${hint})` : ""}`,
      tokLine,
      tokCol,
      start,
      start + bad.length,
      { char: bad },
    );
    for (let k = 0; k < bad.length; k++) advance();
  }

  return { tokens, errors };
}
