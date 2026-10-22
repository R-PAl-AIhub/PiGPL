import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EXAMPLES } from "./examples.ts";
import { MAX_CALL_DEPTH, MAX_OUTPUT_LINES, MAX_STEPS } from "./execute.ts";
import { MAX_AST_DEPTH, MAX_NESTING } from "./parser.ts";
import { compile, MAX_SOURCE_CHARS } from "./pipeline.ts";

/** Compile a program that must be error-free and return what it printed. */
function output(src: string): string[] {
  const r = compile(src);
  assert.deepEqual(r.errors, [], `unexpected errors for:\n${src}`);
  return r.execution!.output;
}

/** Compile a program that must fail and return its first error. */
function firstError(src: string) {
  const r = compile(src);
  assert.ok(r.errors.length > 0, `expected an error for:\n${src}`);
  return r.errors[0]!;
}

const lines = (n: number, make: (i: number) => string) =>
  Array.from({ length: n }, (_, i) => make(i)).join("\n");
const chain = (n: number) => `print(${Array(n).fill("1").join(" + ")})`;
const JARGON = /\b(RPAREN|LPAREN|RBRACE|LBRACE|RBRACKET|LBRACKET|COMMA|COLON|ASSIGN|IDENTIFIER|INTEGER|FLOATNUM|EOF)\b/;

describe("valid inputs", () => {
  it("accepts empty, whitespace-only and comment-only programs", () => {
    for (const src of ["", "   \n\t\n", "# only a comment\n", "# a\n# b"]) {
      const r = compile(src);
      assert.deepEqual(r.errors, [], JSON.stringify(src));
      assert.deepEqual(r.execution?.output, []);
    }
  });

  it("accepts a missing final newline, CRLF line endings and tabs", () => {
    assert.deepEqual(output("print(1)"), ["1"]);
    assert.deepEqual(output("let x: int = 1\r\nprint(x)\r\n"), ["1"]);
    assert.deepEqual(output("let\tx:\tint\t=\t2\nprint(x)"), ["2"]);
  });

  it("prints every kind of value", () => {
    assert.deepEqual(output('print(42)\nprint(2.5)\nprint("hi")\nprint(true)\nprint(false)'), [
      "42",
      "2.5",
      "hi",
      "true",
      "false",
    ]);
    assert.deepEqual(output("print([1, 2, 3])\nprint([])\nprint([[1, 2], [3]])"), [
      "[1, 2, 3]",
      "[]",
      "[[1, 2], [3]]",
    ]);
  });

  it("follows operator precedence and brackets", () => {
    assert.deepEqual(output("print(2 + 3 * 4)\nprint((2 + 3) * 4)\nprint(10 - 4 - 3)"), ["14", "20", "3"]);
    assert.deepEqual(output("print(-2 * -3)\nprint(- - 3)\nprint(not not true)"), ["6", "3", "true"]);
    assert.deepEqual(output("print(true or false and false)\nprint((true or false) and false)"), [
      "true",
      "false",
    ]);
  });

  it("divides ints as ints and floats as floats", () => {
    assert.deepEqual(output("print(7 / 2)\nprint(-7 / 2)\nprint(7.0 / 2.0)\nprint(7 / 2.0)"), [
      "3",
      "-3",
      "3.5",
      "3.5",
    ]);
    assert.deepEqual(output("let a: int = 9\nlet b: int = 4\nprint(a / b)\nprint(a % b)"), ["2", "1"]);
  });

  it("keeps the sign of the left side in a remainder", () => {
    assert.deepEqual(output("print(-7 % 3)\nprint(7 % -3)\nprint(7.5 % 2)"), ["-1", "1", "1.5"]);
  });

  it("works with strings", () => {
    assert.deepEqual(output('print("a" + "b" + "c")\nprint("abc"[1])\nprint("x" == "x")'), ["abc", "b", "true"]);
    assert.deepEqual(output('print("a\\tb\\n\\"q\\"")'), ['a\tb\n"q"']);
  });

  it("compares and combines values", () => {
    assert.deepEqual(output("print(1 < 2.5)\nprint(3 >= 3)\nprint(1 != 1)\nprint(2 == 2.0)"), [
      "true",
      "true",
      "false",
      "true",
    ]);
  });

  it("compares lists by content", () => {
    assert.deepEqual(output("print([1, 2] == [1, 2])\nprint([1, 2] == [2, 1])\nprint([1] != [1, 2])"), [
      "true",
      "false",
      "true",
    ]);
    assert.deepEqual(output('let a: list = [1, [2, 3]]\nlet b: list = [1, [2, 3]]\nprint(a == b)'), ["true"]);
  });

  it("picks the right branch of an if/elif/else chain", () => {
    const src = (n: number) =>
      `let x: int = ${n}\nif x > 10 {\n    print("big")\n} elif x > 3 {\n    print("mid")\n} else {\n    print("small")\n}`;
    assert.deepEqual(output(src(11)), ["big"]);
    assert.deepEqual(output(src(10)), ["mid"]);
    assert.deepEqual(output(src(4)), ["mid"]);
    assert.deepEqual(output(src(3)), ["small"]);
  });

  it("runs while loops, for loops and nested loops", () => {
    assert.deepEqual(output("let n: int = 3\nwhile n > 0 {\n    print(n)\n    n = n - 1\n}"), ["3", "2", "1"]);
    assert.deepEqual(output("let s: int = 0\nfor i in 4 {\n    for j in 3 {\n        s = s + i * j\n    }\n}\nprint(s)"), ["18"]);
    assert.deepEqual(output('for c in "ab" {\n    print(c)\n}'), ["a", "b"]);
    assert.deepEqual(output("for v in [7, 8] {\n    print(v)\n}"), ["7", "8"]);
  });

  it("defines and calls functions, including before the definition", () => {
    assert.deepEqual(output("fn add(a: int, b: int) -> int {\n    return a + b\n}\nprint(add(2, 3))"), ["5"]);
    assert.deepEqual(output("print(twice(4))\nfn twice(n: int) -> int {\n    return n * 2\n}"), ["8"]);
    assert.deepEqual(
      output("fn isEven(n: int) -> bool {\n    if n == 0 {\n        return true\n    }\n    return isOdd(n - 1)\n}\nfn isOdd(n: int) -> bool {\n    if n == 0 {\n        return false\n    }\n    return isEven(n - 1)\n}\nprint(isEven(10))\nprint(isOdd(7))"),
      ["true", "true"],
    );
  });

  it("returns early from a function and from a void function", () => {
    assert.deepEqual(
      output("fn sign(n: int) -> int {\n    if n < 0 {\n        return -1\n    }\n    if n > 0 {\n        return 1\n    }\n    return 0\n}\nprint(sign(-5))\nprint(sign(0))\nprint(sign(9))"),
      ["-1", "0", "1"],
    );
    assert.deepEqual(output("fn say(n: int) {\n    if n > 1 {\n        return\n    }\n    print(n)\n}\nsay(1)\nsay(2)"), ["1"]);
  });

  it("supports list indexing, nested lists and list items in arithmetic", () => {
    assert.deepEqual(output("let xs: list = [10, 20, 30]\nprint(xs[0])\nprint(xs[2])\nxs[1] = 99\nprint(xs)"), [
      "10",
      "30",
      "[10, 99, 30]",
    ]);
    assert.deepEqual(output("let m: list = [[1, 2], [3, 4]]\nprint(m[1][0])\nprint(m[0][1] + m[1][1])"), ["3", "6"]);
    assert.deepEqual(output("let xs: list = [1, 2, 3]\nlet s: int = 0\nfor v in xs {\n    s = s + v\n}\nprint(s)"), ["6"]);
    assert.deepEqual(output("let xs: list = [4, 5]\nlet t: int = xs[0] * xs[1]\nprint(t)"), ["20"]);
  });

  it("lets a float variable hold an int", () => {
    assert.deepEqual(output("let x: float = 3\nprint(x + 0.5)"), ["3.5"]);
    assert.deepEqual(output("fn half(x: float) -> float {\n    return x / 2\n}\nprint(half(5))"), ["2.5"]);
  });
});

describe("scope rules", () => {
  it("lets a function read and change a global variable", () => {
    assert.deepEqual(output("let n: int = 0\nfn inc() {\n    n = n + 1\n}\ninc()\ninc()\nprint(n)"), ["2"]);
    assert.deepEqual(output("let xs: list = [1, 2]\nfn set0() {\n    xs[0] = 9\n}\nset0()\nprint(xs)"), ["[9, 2]"]);
  });

  it("keeps a function's own declarations local", () => {
    assert.deepEqual(
      output("let x: int = 1\nfn f() {\n    let x: int = 50\n    print(x)\n}\nf()\nprint(x)"),
      ["50", "1"],
    );
  });

  it("does not read the caller's locals (no dynamic scope)", () => {
    assert.deepEqual(
      output("let x: int = 1\nfn f() {\n    print(x)\n}\nfn g() {\n    let x: int = 2\n    f()\n}\ng()"),
      ["1"],
    );
  });

  it("gives every recursive call its own parameters and locals", () => {
    assert.deepEqual(
      output("fn count(n: int) -> int {\n    let local: int = n * 10\n    if n == 0 {\n        return 0\n    }\n    return local + count(n - 1)\n}\nprint(count(3))"),
      ["60"],
    );
  });

  it("hides a loop variable after the loop", () => {
    assert.match(firstError("for i in 3 {\n}\nprint(i)").message, /Undeclared identifier: i/);
  });
});

describe("invalid input: lexical errors", () => {
  it("reports the exact position of an invalid character", () => {
    const e = firstError("let x: int = 10 @ 5");
    assert.equal(e.phase, "Lexical");
    assert.equal(e.line, 1);
    assert.equal(e.column, 17);
    assert.match(e.message, /'@'/);
  });

  it("explains common mistakes with a hint", () => {
    const hint = (src: string) => firstError(src).message;
    assert.match(hint("print(!true)"), /'not'/);
    assert.match(hint("print(1 & 2)"), /'and'/);
    assert.match(hint("print(1 | 2)"), /'or'/);
    assert.match(hint("print('hi')"), /double quotes/);
    assert.match(hint("let x: float = .5"), /digits/);
    assert.match(hint("print(1);"), /semicolon/);
    assert.match(hint("print(“hi”)"), /straight/);
    assert.match(hint("print(1) \n"), /space/);
    assert.match(hint("﻿print(1)"), /byte-order mark/);
  });

  it("reports one error for an emoji, not two broken halves", () => {
    const r = compile("let x: int = 1 \u{1F600}\n");
    const lexical = r.errors.filter((e) => e.phase === "Lexical");
    assert.equal(lexical.length, 1);
    assert.ok(lexical[0]!.message.includes("\u{1F600}"));
  });

  it("explains an unterminated string", () => {
    const e = firstError('print("abc)\nprint(2)\n');
    assert.equal(e.phase, "Lexical");
    assert.match(e.message, /Unterminated string literal.*closing/);
    assert.equal(e.line, 1);
  });

  it("rejects an integer that is too large to store exactly", () => {
    const e = firstError("print(99999999999999999999)");
    assert.equal(e.phase, "Lexical");
    assert.match(e.message, /too large.*9007199254740991/);
  });

  it("does not run a program that has a lexical error", () => {
    const r = compile("print(!true)");
    assert.ok(r.errors.some((e) => e.phase === "Lexical"));
    assert.equal(r.execution, null);
    assert.equal(r.phasesOk.execute, false);
    assert.equal(r.phasesOk.semantic, false);
  });
});

describe("invalid input: syntax errors", () => {
  it("uses plain words, not token names", () => {
    const sources = [
      "let x: int =\nprint(x)",
      "print(1",
      "print(1, 2)",
      "let x = 5",
      "let x: int 5",
      "if true {\n    print(1)\n",
      "}\nprint(1)",
      "fn f { }",
      "for i 5 {\n}",
      "let 5 = 3",
      "x",
      "else {\n}",
      "print(1))",
      "fn f(a int) {\n}",
      "while {\n}",
    ];
    for (const src of sources) {
      const r = compile(src);
      assert.ok(r.errors.length > 0, src);
      for (const e of r.errors) {
        assert.doesNotMatch(e.message, JARGON, `jargon in "${e.message}" for ${JSON.stringify(src)}`);
      }
    }
  });

  it("reports a missing expression", () => {
    const e = firstError("let x: int =\nprint(x)");
    assert.equal(e.phase, "Syntax");
    assert.match(e.message, /Expected a value or expression, found 'print'/);
  });

  it("points at the end of the program for a missing bracket", () => {
    const e = firstError("print(1");
    assert.match(e.message, /Expected '\)'.*end of the program/);
    assert.equal(e.line, 1);
    assert.equal(e.column, 8);
  });

  it("names the line of the brace that was never closed", () => {
    const e = firstError("if true {\n    print(1)\n");
    assert.match(e.message, /Expected '\}'.*opened at line 1/);
    assert.equal(e.line, 2);
    assert.equal(e.column, 13);
  });

  it("explains misplaced braces and keywords", () => {
    assert.match(firstError("}\nprint(1)").message, /no matching '\{'/);
    assert.match(firstError("else {\n}").message, /'else' has no matching 'if'/);
    assert.match(firstError("elif true {\n}").message, /'elif' has no matching 'if'/);
  });

  it("explains print with several values", () => {
    const r = compile("print(1, 2)");
    assert.equal(r.errors.length, 1);
    assert.match(r.errors[0]!.message, /one value/);
  });

  it("explains a broken declaration", () => {
    assert.match(firstError("let x = 5").message, /Expected ':' after the variable name, found '='/);
    assert.match(firstError("let x: int 5").message, /Expected '=' after the type, found '5'/);
    assert.match(firstError("let x: banana = 5").message, /Expected a type.*found 'banana'/);
  });

  it("explains a statement that cannot start with this token", () => {
    assert.match(firstError("5 + 3").message, /cannot start with '5'/);
    assert.match(firstError("print(1))").message, /cannot start with '\)'/);
    assert.match(firstError("x").message, /'x' is not a statement/);
  });

  it("explains a broken for loop and function header", () => {
    assert.match(firstError("for i 5 {\n}").message, /Expected 'in' after the loop variable, found '5'/);
    assert.match(firstError("fn f { }").message, /Expected '\(' after the function name, found '\{'/);
  });

  it("does not repeat one mistake as several errors", () => {
    for (const src of ["print(1, 2)", "let x = 5", "let x: int 5", "print(1"]) {
      assert.equal(compile(src).errors.length, 1, src);
    }
  });

  it("gives every syntax error a real line and column", () => {
    for (const src of ["print(1", "if true {", "let x: int =", "fn f(", "[1, 2", "}", "print(", "x ="]) {
      for (const e of compile(src).errors) {
        assert.ok(e.line >= 1 && e.column >= 1, `${JSON.stringify(src)} -> ${e.line}:${e.column} ${e.message}`);
      }
    }
  });

  it("does not build later phases for a broken program", () => {
    const r = compile("let x: int =\nprint(x)");
    assert.equal(r.ir.length, 0);
    assert.equal(r.execution, null);
  });
});

describe("invalid input: semantic errors", () => {
  it("suggests the name you probably meant", () => {
    const e = firstError("let count: int = 1\nprint(cuont)");
    assert.equal(e.phase, "Semantic");
    assert.match(e.message, /Undeclared identifier: cuont \(did you mean 'count'\?\)/);
  });

  it("does not suggest a name when nothing is close", () => {
    assert.equal(firstError("let count: int = 1\nprint(zzzzzz)").message, "Undeclared identifier: zzzzzz");
  });

  it("reports an assignment to an undeclared name", () => {
    assert.match(firstError("x = 5").message, /Undeclared identifier: x/);
  });

  it("reports a duplicate declaration", () => {
    assert.match(firstError("let x: int = 1\nlet x: int = 2").message, /Identifier 'x' is already declared/);
    assert.match(firstError("fn f() {\n}\nfn f() {\n}").message, /Identifier 'f' is already declared/);
  });

  it("reports type mismatches in declarations and assignments", () => {
    assert.match(firstError('let x: int = "a"').message, /expected int, found string/);
    assert.match(firstError("let b: bool = 1").message, /expected bool, found int/);
    assert.match(firstError('let x: int = 1\nx = "a"').message, /Type mismatch in assignment to 'x': expected int, found string/);
  });

  it("does not let a decimal value into an int", () => {
    const e = firstError("let x: int = 1.5");
    assert.match(e.message, /expected int, found float/);
    assert.match(e.message, /declare/);
    assert.match(firstError("let x: int = 2\nx = 2.5").message, /expected int, found float/);
    assert.match(firstError("let x: int = 7 / 2.0").message, /expected int, found float/);
  });

  it("checks conditions, operators and operands", () => {
    assert.match(firstError("if 1 {\n}").message, /Condition must be bool, found int \(use a comparison such as x > 0\)/);
    assert.match(firstError("while 1 {\n}").message, /Condition must be bool/);
    assert.match(firstError('print("a" + 1)').message, /Operator '\+' requires numeric operands, found string and int/);
    assert.match(firstError('print("a" < "b")').message, /Ordered comparison requires numeric operands/);
    assert.match(firstError("print(1 and 2)").message, /requires bool operands/);
    assert.match(firstError("print(not 5)").message, /requires a bool operand/);
    assert.match(firstError('print(-"s")').message, /requires a numeric operand/);
    assert.match(firstError('print(1 == "a")').message, /Type mismatch in comparison/);
  });

  it("checks function calls", () => {
    const decl = "fn add(a: int, b: int) -> int {\n    return a + b\n}\n";
    assert.match(firstError(`${decl}print(add(1))`).message, /Function 'add' expects 2 arguments but got 1/);
    assert.match(firstError(`${decl}print(add(1, 2, 3))`).message, /Function 'add' expects 2 arguments but got 3/);
    assert.match(firstError("fn one(a: int) {\n}\none()").message, /Function 'one' expects 1 argument but got 0/);
    assert.match(firstError('fn f(a: int) {\n}\nf("s")').message, /Argument 1: expected int, found string/);
    assert.match(firstError("let x: int = 1\nx(2)").message, /Cannot call value of type int/);
    assert.match(firstError("nothing(1)").message, /Undeclared identifier: nothing/);
  });

  it("checks return statements", () => {
    assert.match(firstError("return 1").message, /return outside of a function/);
    assert.match(firstError("fn f() {\n    return 1\n}").message, /cannot return a value/);
    assert.match(firstError("fn f() -> int {\n    return\n}").message, /must return a value of type int/);
    assert.match(firstError('fn f() -> int {\n    return "a"\n}').message, /Return type mismatch: expected int, found string/);
  });

  it("requires a return on every path of a function with a result", () => {
    const missing = "must return a value of type int on every path";
    assert.match(firstError("fn f() -> int {\n    print(1)\n}").message, new RegExp(missing));
    assert.match(
      firstError("fn f(a: int) -> int {\n    if a > 0 {\n        return 1\n    }\n}").message,
      new RegExp(missing),
    );
    assert.match(
      firstError("fn f(a: int) -> int {\n    while a > 0 {\n        return 1\n    }\n}").message,
      new RegExp(missing),
    );
    assert.deepEqual(
      output("fn f(a: int) -> int {\n    if a > 0 {\n        return 1\n    } elif a < 0 {\n        return -1\n    } else {\n        return 0\n    }\n}\nprint(f(2))"),
      ["1"],
    );
  });

  it("allows functions only at the top level", () => {
    const nested = firstError("fn outer() {\n    fn inner() {\n    }\n}");
    assert.match(nested.message, /top level/);
    assert.match(firstError("if true {\n    fn f() {\n    }\n}").message, /top level/);
    assert.match(firstError("while false {\n    fn f() {\n    }\n}").message, /top level/);
    // The rejected function is still recorded, so calling it adds no second, misleading error.
    assert.equal(compile("fn outer() {\n    fn inner() {\n    }\n    inner()\n}").errors.length, 1);
  });

  it("refuses to change an item inside a nested list", () => {
    const e = firstError("let m: list = [[1, 2], [3, 4]]\nm[0][1] = 5");
    assert.equal(e.phase, "Semantic");
    assert.match(e.message, /nested list/);
  });

  it("rejects printing a call that returns nothing", () => {
    assert.match(firstError("fn f() {\n}\nprint(f())").message, /returns nothing/);
  });

  it("checks lists, indexes and loops", () => {
    assert.match(firstError('let xs: list = [1]\nprint(xs["a"])').message, /List index must be int, found string/);
    assert.match(firstError("let x: int = 1\nprint(x[0])").message, /Cannot index type int/);
    assert.match(firstError("for i in true {\n}").message, /Cannot iterate over type bool/);
    assert.match(firstError("let x: int = 1\nx[0] = 2").message, /Indexed assignment requires a list/);
  });

  it("checks parameters and assignments to functions", () => {
    assert.match(firstError("fn f(a: int, a: int) {\n}").message, /Duplicate parameter 'a'/);
    assert.match(firstError("fn f() {\n}\nf = 1").message, /Cannot assign to function 'f'/);
  });

  it("still shows TAC but does not run a program with a semantic error", () => {
    const r = compile("let x: int = y + 10\nprint(x)");
    assert.ok(r.errors.some((e) => e.phase === "Semantic"));
    assert.ok(r.ir.length > 0);
    assert.equal(r.execution, null);
  });
});

describe("boundary cases", () => {
  it("handles the largest exact integer", () => {
    assert.deepEqual(output("print(9007199254740991)\nprint(-9007199254740991)"), ["9007199254740991", "-9007199254740991"]);
    const e = firstError("print(9007199254740992)");
    assert.equal(e.phase, "Lexical");
  });

  it("reports an integer overflow instead of a wrong number", () => {
    for (const body of [
      "let a: int = 9007199254740991\nprint(a + 1)",
      "let a: int = -9007199254740991\nprint(a - 1)",
      "let a: int = 9007199254740991\nprint(a * 2)",
    ]) {
      const e = firstError(body);
      assert.equal(e.phase, "Runtime");
      assert.match(e.message, /Integer overflow/);
    }
  });

  it("reports an integer overflow even when the optimizer could fold it", () => {
    const e = firstError("print(9007199254740991 + 1)");
    assert.equal(e.phase, "Runtime");
    assert.match(e.message, /Integer overflow/);
  });

  it("finds the factorial overflow point exactly", () => {
    const fact = (n: number) =>
      `fn fact(n: int) -> int {\n    if n <= 1 {\n        return 1\n    }\n    return n * fact(n - 1)\n}\nprint(fact(${n}))`;
    assert.deepEqual(output(fact(18)), ["6402373705728000"]);
    assert.match(firstError(fact(19)).message, /Integer overflow/);
  });

  it("does not limit float math", () => {
    assert.deepEqual(output("print(10000000000.0 * 10000000000.0)"), ["100000000000000000000"]);
    assert.deepEqual(output("print(0.1 + 0.2)"), ["0.30000000000000004"]);
  });

  it("handles zero", () => {
    assert.deepEqual(output("print(0 / 5)\nprint(0 % 5)\nprint(5 % 1)\nprint(-0)"), ["0", "0", "0", "0"]);
  });

  it("handles empty lists and zero-length loops", () => {
    assert.deepEqual(output("let xs: list = []\nfor v in xs {\n    print(v)\n}\nprint(xs)"), ["[]"]);
    assert.deepEqual(output("for i in 0 {\n    print(i)\n}\nprint(1)"), ["1"]);
    assert.deepEqual(output("for i in 1 {\n    print(i)\n}"), ["0"]);
  });

  it("accepts the first and last list index and rejects the next ones", () => {
    const base = "let xs: list = [1, 2, 3]\n";
    assert.deepEqual(output(`${base}print(xs[0])\nprint(xs[2])`), ["1", "3"]);
    for (const idx of ["3", "-1", "100"]) {
      const e = firstError(`${base}print(xs[${idx}])`);
      assert.equal(e.phase, "Runtime");
      assert.match(e.message, new RegExp(`List index ${idx} is out of range.*valid indexes are 0 to 2`));
    }
  });

  it("explains an index into an empty list or string", () => {
    assert.match(firstError("let xs: list = []\nprint(xs[0])").message, /is empty/);
    assert.match(firstError('let s: string = "ab"\nprint(s[2])').message, /String index 2 is out of range.*0 to 1/);
    assert.match(firstError('print(""[0])').message, /is empty/);
  });

  it("does not grow a list by assigning past its end", () => {
    assert.deepEqual(output("let xs: list = [1, 2]\nxs[1] = 5\nprint(xs)"), ["[1, 5]"]);
    const e = firstError("let xs: list = [1, 2]\nxs[2] = 5");
    assert.match(e.message, /List index 2 is out of range/);
  });

  it("rejects a fractional list index at run time", () => {
    const e = firstError("let xs: list = [1, 2]\nlet i: list = [1.5]\nprint(xs[i[0]])");
    assert.match(e.message, /must be a whole number/);
  });

  it("gives a copy of a list to each variable", () => {
    assert.deepEqual(output("let a: list = [1, 2]\nlet b: list = a\nb[0] = 9\nprint(a)\nprint(b)"), ["[1, 2]", "[9, 2]"]);
  });

  it("accepts deep nesting up to the limit and explains the limit after it", () => {
    const nest = (n: number) => `print(${"(".repeat(n)}1${")".repeat(n)})`;
    assert.deepEqual(output(nest(MAX_NESTING - 2)), ["1"]);
    const e = firstError(nest(MAX_NESTING + 50));
    assert.equal(e.phase, "Syntax");
    assert.match(e.message, /nested too deeply/);
    assert.match(firstError(`let x: list = ${"[".repeat(500)}1${"]".repeat(500)}`).message, /nested too deeply/);
    assert.match(firstError(`${"if true {\n".repeat(300)}print(1)\n${"}\n".repeat(300)}`).message, /nested too deeply/);
  });

  it("accepts a long expression up to the limit and explains the limit after it", () => {
    assert.deepEqual(output(chain(MAX_AST_DEPTH)), [String(MAX_AST_DEPTH)]);
    const e = firstError(chain(MAX_AST_DEPTH + 1));
    assert.equal(e.phase, "Syntax");
    assert.match(e.message, /nested too deeply/);
    assert.match(firstError(`print(${"not ".repeat(MAX_AST_DEPTH + 5)}true)`).message, /nested too deeply/);
    assert.match(firstError(`print(${"-".repeat(MAX_AST_DEPTH + 5)}1)`).message, /nested too deeply/);
  });

  it("never throws, whatever the size or depth of the input", () => {
    for (const src of [
      chain(50000),
      `print(${"(".repeat(100000)}1${")".repeat(100000)})`,
      `${"if true {\n".repeat(50000)}`,
      "(".repeat(200000),
      "-".repeat(200000),
    ]) {
      const r = compile(src);
      assert.ok(r.errors.length > 0);
      assert.ok(r.errors.every((e) => e.phase !== "Internal"), r.errors[0]?.message);
    }
  });

  it("rejects a source that is over the size limit", () => {
    const e = firstError("a".repeat(MAX_SOURCE_CHARS + 1));
    assert.equal(e.phase, "Limit");
    assert.match(e.message, /too large/);
    assert.match(e.message, new RegExp(MAX_SOURCE_CHARS.toLocaleString("en-US")));
  });

  it("limits the number of reported errors", () => {
    const r = compile("@".repeat(5000));
    assert.ok(r.errors.length <= 101);
    assert.match(r.errors[r.errors.length - 1]!.message, /Too many errors/);
  });
});

describe("runtime error conditions", () => {
  it("reports division by zero with the line number", () => {
    const e = firstError("print(5 / 0)");
    assert.equal(e.phase, "Runtime");
    assert.equal(e.message, "Division by zero");
    assert.equal(e.line, 1);
    assert.equal(firstError("let z: int = 0\nprint(5 % z)").line, 2);
    assert.equal(firstError("print(5.0 / 0.0)").message, "Division by zero");
    assert.equal(firstError("let z: int = 0\nprint(5 / z)").message, "Division by zero");
  });

  it("keeps the output printed before a runtime error", () => {
    const r = compile("print(1)\nprint(2)\nprint(1 / 0)\nprint(3)");
    assert.deepEqual(r.execution?.output, ["1", "2"]);
    assert.equal(r.errors[0]!.phase, "Runtime");
  });

  it("rejects mixed types that the static check cannot see", () => {
    const e = firstError('let xs: list = [1, 2]\nprint(xs[0] + "a")');
    assert.equal(e.phase, "Runtime");
    assert.match(e.message, /Operator '\+' needs two numbers or two strings, found number and string/);
    assert.match(firstError('let xs: list = ["a"]\nprint(xs[0] - 1)').message, /Operator '-' requires numeric operands, found string and number/);
  });

  it("stops a loop that never ends", () => {
    const t0 = performance.now();
    const e = firstError("while true {\n}");
    assert.equal(e.phase, "Runtime");
    assert.match(e.message, /possible infinite loop/);
    assert.ok(e.message.includes(MAX_STEPS.toLocaleString("en-US")), e.message);
    assert.ok(performance.now() - t0 < 5000, "an endless loop must stop quickly");
  });

  it("stops endless recursion with a clear message", () => {
    const e = firstError("fn f() {\n    f()\n}\nf()");
    assert.equal(e.phase, "Runtime");
    assert.match(e.message, new RegExp(`Maximum call depth of ${MAX_CALL_DEPTH.toLocaleString("en-US")}`));
    assert.match(e.message, /calls itself/);
  });

  it("allows recursion up to the depth limit", () => {
    const depth = (n: number) =>
      `fn d(n: int) -> int {\n    if n == 0 {\n        return 0\n    }\n    return 1 + d(n - 1)\n}\nprint(d(${n}))`;
    assert.deepEqual(output(depth(MAX_CALL_DEPTH - 10)), [String(MAX_CALL_DEPTH - 10)]);
    assert.match(firstError(depth(MAX_CALL_DEPTH + 10)).message, /Maximum call depth/);
  });

  it("limits the number of output lines", () => {
    const loop = (n: number) => `for i in ${n} {\n    print(i)\n}`;
    assert.equal(output(loop(MAX_OUTPUT_LINES)).length, MAX_OUTPUT_LINES);
    const r = compile(loop(MAX_OUTPUT_LINES + 1));
    assert.match(r.errors[0]!.message, /Output limit of 10,000 lines/);
    assert.equal(r.execution?.output.length, MAX_OUTPUT_LINES);
  });

  it("runs long but valid loops that the old 8000-step limit rejected", () => {
    assert.deepEqual(output("let s: int = 0\nfor i in 2000 {\n    s = s + i\n}\nprint(s)"), ["1999000"]);
    assert.deepEqual(output("let s: int = 0\nfor i in 100000 {\n    s = s + i\n}\nprint(s)"), ["4999950000"]);
  });

  it("keeps the recorded trace small for a long run", () => {
    const r = compile("let s: int = 0\nfor i in 100000 {\n    s = s + i\n}\nprint(s)");
    assert.ok(r.execution!.steps.length < 10000, String(r.execution!.steps.length));
    assert.ok(r.execution!.steps.some((s) => s.output === "4999950000"), "the final print must stay in the trace");
  });
});

describe("complex programs", () => {
  it("sorts a list with bubble sort", () => {
    const src = `let xs: list = [5, 2, 9, 1, 7]
let n: int = 5
for i in n {
    for j in n - 1 {
        if xs[j] > xs[j + 1] {
            let tmp: int = xs[j]
            xs[j] = xs[j + 1]
            xs[j + 1] = tmp
        }
    }
}
print(xs)`;
    assert.deepEqual(output(src), ["[1, 2, 5, 7, 9]"]);
  });

  it("finds the primes below 30 with a sieve", () => {
    const src = `let sieve: list = [${Array(30).fill("true").join(", ")}]
let count: int = 0
for i in 30 {
    if i >= 2 {
        if sieve[i] {
            print(i)
            let k: int = i * 2
            while k < 30 {
                sieve[k] = false
                k = k + i
            }
        }
    }
}`;
    assert.deepEqual(output(src), ["2", "3", "5", "7", "11", "13", "17", "19", "23", "29"]);
  });

  it("computes a gcd with recursion and a remainder", () => {
    assert.deepEqual(
      output("fn gcd(a: int, b: int) -> int {\n    if b == 0 {\n        return a\n    }\n    return gcd(b, a % b)\n}\nprint(gcd(48, 18))\nprint(gcd(17, 5))"),
      ["6", "1"],
    );
  });

  it("counts the Collatz steps of 27", () => {
    const src = `fn steps(n: int) -> int {
    let count: int = 0
    while n != 1 {
        if n % 2 == 0 {
            n = n / 2
        } else {
            n = 3 * n + 1
        }
        count = count + 1
    }
    return count
}
print(steps(27))`;
    assert.deepEqual(output(src), ["111"]);
  });

  it("computes Fibonacci numbers by recursion and by a loop", () => {
    const rec = "fn fib(n: int) -> int {\n    if n < 2 {\n        return n\n    }\n    return fib(n - 1) + fib(n - 2)\n}\nprint(fib(15))";
    assert.deepEqual(output(rec), ["610"]);
    const loop = "let a: int = 0\nlet b: int = 1\nfor i in 30 {\n    let t: int = a + b\n    a = b\n    b = t\n}\nprint(a)";
    assert.deepEqual(output(loop), ["832040"]);
  });

  it("searches a sorted list with binary search", () => {
    const src = `fn find(xs: list, target: int) -> int {
    let lo: int = 0
    let hi: int = 4
    while lo <= hi {
        let mid: int = (lo + hi) / 2
        if xs[mid] == target {
            return mid
        } elif xs[mid] < target {
            lo = mid + 1
        } else {
            hi = mid - 1
        }
    }
    return -1
}
let data: list = [1, 3, 5, 7, 9]
print(find(data, 7))
print(find(data, 4))`;
    assert.deepEqual(output(src), ["3", "-1"]);
  });

  it("builds a string in a loop", () => {
    assert.deepEqual(output('let s: string = ""\nfor i in 3 {\n    s = s + "ab"\n}\nprint(s)'), ["ababab"]);
  });

  it("sums a nested list", () => {
    const src = "let m: list = [[1, 2], [3, 4]]\nlet total: int = 0\nfor row in m {\n    for v in row {\n        total = total + v\n    }\n}\nprint(total)";
    assert.deepEqual(output(src), ["10"]);
  });

  it("nests function calls and passes lists by value", () => {
    assert.deepEqual(
      output("fn inc(n: int) -> int {\n    return n + 1\n}\nfn dbl(n: int) -> int {\n    return n * 2\n}\nprint(dbl(inc(dbl(inc(1)))))"),
      ["10"],
    );
    assert.deepEqual(
      output("fn bump(xs: list) -> list {\n    xs[0] = 100\n    return xs\n}\nlet a: list = [1, 2]\nlet b: list = bump(a)\nprint(a)\nprint(b)"),
      ["[1, 2]", "[100, 2]"],
    );
  });

  it("combines every statement kind in one program", () => {
    const src = `# every feature in one program
fn square(n: int) -> int {
    return n * n
}
let total: int = 0
let names: list = ["ann", "bo"]
for i in 5 {
    if i % 2 == 0 and i > 0 {
        total = total + square(i)
    } elif not (i == 1) {
        total = total + 1
    }
}
for name in names {
    print("hi " + name)
}
let w: int = 3
while w > 0 {
    w = w - 1
}
print(total)
print(w)`;
    assert.deepEqual(output(src), ["hi ann", "hi bo", "22", "0"]);
  });
});

describe("pipeline invariants", () => {
  /** Every artifact must point at a real, in-range event so the replay can reveal it. */
  function assertCoherent(src: string) {
    const r = compile(src);
    const ids = new Set(r.events.map((e) => e.id));
    assert.equal(ids.size, r.events.length, "event ids are unique");
    r.events.forEach((e, i) => assert.equal(e.id, i + 1, "event ids are sequential"));
    for (const t of r.tokens) assert.ok(ids.has(t.eventId), `token ${t.lexeme}`);
    for (const s of r.symbols) assert.ok(ids.has(s.eventId), `symbol ${s.name}`);
    for (const c of r.checks) assert.ok(ids.has(c.eventId), `check ${c.message}`);
    for (const q of r.ir) assert.ok(ids.has(q.eventId), `quad ${q.text}`);
    for (const s of r.optimizations) assert.ok(ids.has(s.eventId), `step ${s.message}`);
    for (const e of r.errors) {
      assert.notEqual(e.phase, "Internal", e.message);
      if (e.phase === "Lexical" || e.phase === "Syntax" || e.phase === "Semantic") {
        assert.ok(e.line >= 1 && e.column >= 1, `${e.phase} error at ${e.line}:${e.column}: ${e.message}`);
      }
    }
    return r;
  }

  it("links every artifact of every example to an event", () => {
    for (const ex of EXAMPLES) assertCoherent(ex.source);
  });

  it("compiles the same source to the same result", () => {
    for (const ex of EXAMPLES) {
      const a = compile(ex.source);
      const b = compile(ex.source);
      assert.deepEqual(a.errors, b.errors, ex.id);
      assert.deepEqual(a.execution?.output, b.execution?.output, ex.id);
      assert.deepEqual(a.optimizedIr.map((q) => q.text), b.optimizedIr.map((q) => q.text), ex.id);
    }
  });

  it("preserves what a program prints when the optimizer rewrites it", () => {
    const programs = [
      "let x: int = 2 + 3 * 4\nlet y: int = x * 1 + 0\nprint(y)",
      "let a: int = 5\nlet b: int = a\nlet c: int = b + 0\nprint(c * 1)",
      "let s: int = 0\nfor i in 10 {\n    s = s + i * 1 + 0\n}\nprint(s)",
      "let x: int = 3\nif x > 2 {\n    x = x + 1\n}\nprint(x)",
    ];
    for (const src of programs) {
      const r = compile(src);
      assert.deepEqual(r.errors, [], src);
      assert.ok(r.optimizedIr.length <= r.ir.length, src);
    }
    assert.deepEqual(output(programs[0]!), ["14"]);
    assert.deepEqual(output(programs[2]!), ["45"]);
    assert.deepEqual(output(programs[3]!), ["4"]);
  });

  it("never throws on random token soup", () => {
    const pieces = [
      "let ", "x", "y", ":", "int", "float", "list", "=", "==", "1", "2.5", '"s"', "+", "-", "*", "/", "%",
      "(", ")", "{", "}", "[", "]", ",", "if ", "else ", "elif ", "while ", "for ", " in ", "fn ", "->",
      "return ", "print", "and ", "or ", "not ", "true", "false", "\n", " ", "#c\n", "@", "!", "\u{1F600}", '"',
      "xs", "f", "99999999999999999999",
    ];
    let seed = 12345;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    for (let n = 0; n < 400; n++) {
      const len = 1 + Math.floor(rand() * 40);
      let src = "";
      for (let i = 0; i < len; i++) src += pieces[Math.floor(rand() * pieces.length)];
      assertCoherent(src);
    }
  });

  it("never throws on damaged copies of the examples", () => {
    let seed = 987;
    const rand = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const junk = ["(", ")", "{", "}", "\n", "let ", "\"", "@", "fn ", "1", "else", "[", "]", ","];
    for (const ex of EXAMPLES) {
      for (let n = 0; n < 40; n++) {
        const at = Math.floor(rand() * ex.source.length);
        const cut = Math.floor(rand() * 6);
        const src = ex.source.slice(0, at) + junk[Math.floor(rand() * junk.length)] + ex.source.slice(at + cut);
        assertCoherent(src);
      }
    }
  });
});

describe("performance", () => {
  const time = (src: string) => {
    const times: number[] = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      compile(src);
      times.push(performance.now() - t0);
    }
    return times.sort((a, b) => a - b)[1]!;
  };

  it("compiles a thousand declarations quickly", () => {
    const src = `${lines(1000, (i) => `let v${i}: int = ${i} + 1`)}\nprint(v999)`;
    assert.ok(time(src) < 2000, "1,000 declarations must compile in well under two seconds");
  });

  it("scales roughly linearly with program size", () => {
    const make = (n: number) => `${lines(n, (i) => `let v${i}: int = ${i} + 1`)}\nprint(v${n - 1})`;
    compile(make(500));
    const small = time(make(1000));
    const large = time(make(4000));
    assert.ok(large / small < 12, `4x the code took ${(large / small).toFixed(1)}x the time`);
  });

  it("runs a hundred thousand loop iterations in a few seconds", () => {
    const t0 = performance.now();
    assert.deepEqual(output("let s: int = 0\nfor i in 100000 {\n    s = s + i\n}\nprint(s)"), ["4999950000"]);
    assert.ok(performance.now() - t0 < 5000);
  });
});
