import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EXAMPLES } from "./examples.ts";
import { compile } from "./pipeline.ts";

const ifSrc = EXAMPLES.find((e) => e.id === "if")!.source;
const arithSrc = EXAMPLES.find((e) => e.id === "arithmetic")!.source;
const lexErr = EXAMPLES.find((e) => e.id === "lexical")!.source;
const synErr = EXAMPLES.find((e) => e.id === "syntax")!.source;
const semErr = EXAMPLES.find((e) => e.id === "semantic")!.source;
const foldSrc = EXAMPLES.find((e) => e.id === "optimize")!.source;
const factSrc = EXAMPLES.find((e) => e.id === "factorial")!.source;
const fnSrc = EXAMPLES.find((e) => e.id === "functions")!.source;
const whileSrc = EXAMPLES.find((e) => e.id === "while")!.source;
const forSrc = EXAMPLES.find((e) => e.id === "for")!.source;
const listSrc = EXAMPLES.find((e) => e.id === "lists")!.source;

describe("PiGPL pipeline", () => {
  it("lexes keywords, identifiers, and literals in order", () => {
    const r = compile("let x: int = 10\nprint(x)\n");
    const types = r.tokens.map((t) => t.type);
    assert.deepEqual(types, [
      "LET",
      "IDENTIFIER",
      "COLON",
      "TYPE",
      "ASSIGN",
      "INTEGER",
      "PRINT",
      "LPAREN",
      "IDENTIFIER",
      "RPAREN",
    ]);
    assert.equal(r.tokens[1]!.lexeme, "x");
    assert.equal(r.tokens[5]!.value, 10);
    assert.equal(r.errors.length, 0);
  });

  it("reports invalid characters as lexical errors", () => {
    const r = compile(lexErr);
    assert.ok(r.errors.some((e) => e.phase === "Lexical" && e.message.includes("@")));
  });

  it("parses arithmetic with * binding tighter than +", () => {
    const r = compile(arithSrc);
    assert.equal(r.errors.length, 0);
    assert.ok(r.ast);
    const decl = r.ast!.statements.find((s) => s.kind === "declaration" && s.name === "result");
    assert.ok(decl && decl.kind === "declaration");
    assert.equal(decl.value.kind, "binary");
    if (decl.value.kind === "binary") {
      assert.equal(decl.value.operator, "-");
      assert.equal(decl.value.left.kind, "binary");
      if (decl.value.left.kind === "binary") {
        assert.equal(decl.value.left.operator, "+");
        assert.equal(decl.value.left.right.kind, "binary");
        if (decl.value.left.right.kind === "binary") {
          assert.equal(decl.value.left.right.operator, "*");
        }
      }
    }
  });

  it("flags incomplete declarations as syntax errors", () => {
    const r = compile(synErr);
    assert.ok(r.errors.some((e) => e.phase === "Syntax"));
    assert.equal(r.ir.length, 0);
  });

  it("builds a symbol table from declarations", () => {
    const r = compile(ifSrc);
    assert.equal(r.errors.length, 0);
    const names = r.symbols.map((s) => s.name);
    assert.deepEqual(names, ["x", "y", "z"]);
    assert.equal(r.symbols[0]!.varType, "int");
    assert.equal(r.symbols[0]!.scope, "global");
  });

  it("rejects undeclared identifiers", () => {
    const r = compile(semErr);
    assert.ok(r.errors.some((e) => e.phase === "Semantic" && e.message.includes("y")));
  });

  it("emits three-address code for a valid program", () => {
    const r = compile(ifSrc);
    assert.ok(r.ir.length > 0);
    assert.ok(r.ir.some((q) => q.op === "+"));
    assert.ok(r.ir.some((q) => q.op === "ifFalse"));
    assert.ok(r.ir.some((q) => q.op === "print"));
    assert.ok(r.ir.some((q) => q.op === "func" && q.result === "main"));
  });

  it("folds 2 + 3 * 4 into a constant", () => {
    const r = compile(foldSrc);
    assert.equal(r.errors.length, 0);
    assert.ok(r.optimizations.length > 0);
    const joined = r.optimizedIr.map((q) => q.text).join("\n");
    assert.ok(/=\s*14/.test(joined) || joined.includes("14"), joined);
    assert.equal(r.execution?.output.join("\n"), "14");
  });

  it("executes if/else and prints Greater", () => {
    const r = compile(ifSrc);
    assert.deepEqual(r.execution?.output, ["Greater"]);
  });

  it("executes while, for, lists, and functions", () => {
    const w = compile(whileSrc);
    assert.deepEqual(w.execution?.output, ["5", "4", "3", "2", "1", "done"]);

    const f = compile(forSrc);
    assert.deepEqual(f.execution?.output, ["0", "1", "2", "3", "4", "10"]);

    const l = compile(listSrc);
    assert.deepEqual(l.execution?.output, ["20", "10", "20", "30"]);

    const fn = compile(fnSrc);
    assert.deepEqual(fn.execution?.output, ["11"]);
  });

  it("executes recursive factorial", () => {
    const r = compile(factSrc);
    assert.equal(r.errors.length, 0);
    assert.deepEqual(r.execution?.output, ["120"]);
  });

  it("emits a coherent event timeline across every phase", () => {
    const r = compile(ifSrc);
    const phases = r.events.map((e) => e.phase);
    const first = (p: string) => phases.indexOf(p as (typeof phases)[number]);
    assert.ok(first("lexer") >= 0);
    assert.ok(first("parser") > first("lexer"));
    assert.ok(first("semantic") > first("parser"));
    assert.ok(first("ir") > first("semantic"));
    assert.ok(first("optimize") > first("ir") || r.optimizations.length === 0);
    assert.ok(first("execute") > first("ir"));
    assert.ok(r.tree);
    assert.equal(r.tree!.kind, "program");
    assert.ok(r.tokens.every((t) => t.eventId > 0));
  });

  it("walks source → lexer → tokens → parser → AST → symbols → semantic → TAC → optimize", () => {
    const r = compile(arithSrc);
    assert.ok(r.source.includes("let a"));
    assert.ok(r.tokens.length > 0, "lexer produced tokens");
    assert.ok(r.ast && r.ast.kind === "program", "parser produced AST");
    assert.ok(r.tree && r.tree.children.length > 0, "AST tree is populated");
    assert.ok(r.symbols.length >= 4, "symbol table filled");
    assert.ok(r.checks.some((c) => c.ok), "semantic checks ran");
    assert.ok(r.ir.some((q) => q.text.includes("*") || q.op === "*"), "TAC includes multiply");
    assert.ok(r.optimizedIr.length > 0, "optimizer produced IR");
    assert.equal(r.errors.length, 0);
    assert.deepEqual(r.execution?.output, ["13"]);
  });

  it("lets a function update globals but keeps its own declarations local", () => {
    const r = compile(
      "let count: int = 0\nlet xs: list = [1, 2]\nfn inc() {\n    count = count + 1\n    xs[0] = 9\n}\nfn shadow() {\n    let count: int = 50\n    print(count)\n}\ninc()\ninc()\nshadow()\nlet after: int = count + 1\nprint(count)\nprint(after)\nprint(xs)\n",
    );
    assert.equal(r.errors.length, 0);
    assert.deepEqual(r.execution?.output, ["50", "2", "3", "[9, 2]"]);
  });

  it("keeps int / int an int, at runtime and when folded", () => {
    const r = compile("let a: int = 7\nlet b: int = 2\nprint(a / b)\nprint(7 / 2)\nprint(7.0 / 2.0)\n");
    assert.equal(r.errors.length, 0);
    assert.deepEqual(r.execution?.output, ["3", "3", "3.5"]);
  });

  it("reports division by zero as a runtime error", () => {
    const r = compile("let z: int = 0\nlet r: int = 5 / z\nprint(r)\n");
    assert.equal(r.execution?.error?.message, "Division by zero");
    assert.ok(r.errors.some((e) => e.phase === "Runtime"));
  });
});
