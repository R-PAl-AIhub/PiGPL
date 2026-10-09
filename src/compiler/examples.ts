export interface Example {
  id: string;
  name: string;
  blurb: string;
  source: string;
}

export const EXAMPLES: Example[] = [
  {
    id: "if",
    name: "If / else",
    blurb: "Declarations, arithmetic, and a comparison branch",
    source: `let x: int = 10
let y: int = 20
let z: int = x + y

if z > 20 {
    print("Greater")
} else {
    print("Not greater")
}
`,
  },
  {
    id: "basic",
    name: "Basic",
    blurb: "A single declaration and print",
    source: `# Basic variable declaration and print
let x: int = 10
print(x)
`,
  },
  {
    id: "arithmetic",
    name: "Arithmetic",
    blurb: "Operator precedence: * binds tighter than +",
    source: `# Arithmetic expressions and operator precedence
let a: int = 4
let b: int = 5
let c: int = 2
let result: int = a + b * c - 1
print(result)
`,
  },
  {
    id: "optimize",
    name: "Constant fold",
    blurb: "Watch 2 + 3 * 4 collapse in the optimizer",
    source: `let x: int = 2 + 3 * 4
let y: int = x * 1 + 0
print(y)
`,
  },
  {
    id: "while",
    name: "While",
    blurb: "A countdown loop that prints each value",
    source: `let n: int = 5
while n > 0 {
    print(n)
    n = n - 1
}
print("done")
`,
  },
  {
    id: "for",
    name: "For range",
    blurb: "for i in n iterates 0 .. n-1",
    source: `let sum: int = 0
for i in 5 {
    sum = sum + i
    print(i)
}
print(sum)
`,
  },
  {
    id: "lists",
    name: "Lists",
    blurb: "List literals, indexing, and for-in",
    source: `let xs: list = [10, 20, 30]
print(xs[1])
for v in xs {
    print(v)
}
`,
  },
  {
    id: "functions",
    name: "Functions",
    blurb: "A typed function with a return value",
    source: `fn add(a: int, b: int) -> int {
    return a + b
}

let s: int = add(4, 7)
print(s)
`,
  },
  {
    id: "factorial",
    name: "Factorial",
    blurb: "Recursive function — IR becomes a call graph",
    source: `fn fact(n: int) -> int {
    if n <= 1 {
        return 1
    }
    return n * fact(n - 1)
}

print(fact(5))
`,
  },
  {
    id: "logical",
    name: "Logic",
    blurb: "and / or / not with elif",
    source: `let a: int = 4
let b: int = 9
if a > 0 and b > 8 {
    print("both")
} elif not (a == b) {
    print("unequal")
} else {
    print("else")
}
`,
  },
  {
    id: "lexical",
    name: "Lexical error",
    blurb: "@ is not a PiGPL character",
    source: `# Demonstrates a lexical error: '@' is not a valid PiGPL character
let x: int = 10 @ 5
print(x)
`,
  },
  {
    id: "syntax",
    name: "Syntax error",
    blurb: "Declaration missing its expression",
    source: `# Demonstrates a syntax error: declaration is missing its expression
let x: int =
print(x)
`,
  },
  {
    id: "semantic",
    name: "Semantic error",
    blurb: "Use of an undeclared identifier",
    source: `# Demonstrates a semantic error: 'y' is used before it is declared
let x: int = y + 10
print(x)
`,
  },
];

export const GRAMMAR = `program      ::= statement*
statement    ::= declaration | assignment | if_stmt | while_stmt
               | for_stmt | fn_stmt | return_stmt | print_stmt | expr_stmt
declaration  ::= "let" IDENTIFIER ":" type "=" expression
assignment   ::= IDENTIFIER "=" expression
               | postfix "[" expression "]" "=" expression
print_stmt   ::= "print" "(" expression ")"
if_stmt      ::= "if" expression block
               ("elif" expression block)*
               ("else" block)?
while_stmt   ::= "while" expression block
for_stmt     ::= "for" IDENTIFIER "in" expression block
fn_stmt      ::= "fn" IDENTIFIER "(" params? ")" ("->" type)? block
return_stmt  ::= "return" expression?
block        ::= "{" statement* "}"
expression   ::= or_expr
or_expr      ::= and_expr ("or" and_expr)*
and_expr     ::= not_expr ("and" not_expr)*
not_expr     ::= "not" not_expr | comparison
comparison   ::= term (("=="|"!="|"<"|">"|"<="|">=") term)*
term         ::= factor (("+"|"-") factor)*
factor       ::= unary (("*"|"/"|"%") unary)*
unary        ::= "-" unary | postfix
postfix      ::= primary ("(" args? ")" | "[" expression "]")*
primary      ::= INTEGER | FLOAT | STRING | "true" | "false"
               | IDENTIFIER | "(" expression ")" | "[" list "]"
type         ::= "int" | "float" | "bool" | "string" | "list"`;
