# PiGPL

PiGPL is a small programming language. The name means "Python-inspired General Purpose Language".

This project is a web app for PiGPL. You write a PiGPL program in the app. The app compiles the program and runs it. The app also shows you each step of this work.

A compiler is a program that reads code and changes it into a form that a computer can run. Use this app to learn how a compiler does its work, one step at a time.

## Contents

1. [What you need](#what-you-need)
2. [Start the app](#start-the-app)
3. [Your first program](#your-first-program)
4. [The parts of the screen](#the-parts-of-the-screen)
5. [Use the replay controls](#use-the-replay-controls)
6. [The compiler stages](#the-compiler-stages)
7. [Write PiGPL programs](#write-pigpl-programs)
8. [Error messages](#error-messages)
9. [Save and export your work](#save-and-export-your-work)
10. [Sample programs](#sample-programs)
11. [Known limits](#known-limits)
12. [Project files](#project-files)
13. [Commands](#commands)
14. [Words used in this guide](#words-used-in-this-guide)

## What you need

- **Node.js, version 22 or newer.** Get it from [nodejs.org](https://nodejs.org). Node.js runs JavaScript programs on your computer.
- **npm.** npm installs the packages that the app uses. npm comes with Node.js.
- **A web browser.** Any modern browser is good. Examples are Chrome, Edge and Firefox.

To check your Node.js version, open a terminal and type this command:

```bash
node -v
```

The result must be `v22` or a higher number.

## Start the app

1. Open a terminal in the project folder (the folder that contains this file).
2. Install the packages:

   ```bash
   npm install
   ```

   Do this step one time only. Do it again only if the file `package.json` changes.

3. Start the app:

   ```bash
   npm run dev
   ```

4. Open this address in your browser: <http://localhost:8080>

To stop the app, go to the terminal and press `Ctrl+C`.

**Important:** Do not start the app with the `vite` command directly. Always use `npm run dev`. The npm command loads the project settings first.

**If you see the message "Port 8080 is already in use":** another copy of the app is running. Open <http://localhost:8080> to use that copy. Or stop that copy and start the app again.

## Your first program

1. Open the app. The editor on the left shows a sample program.
2. Click **Compile** in the top-right corner.
3. Watch the app. It plays the compile process step by step. The tab at the top changes for each stage.
4. Wait for the replay to stop. The **Execute** tab then shows the output of the program.
5. Change the program in the editor. For example, change `10` to `5`.
6. Click **Compile** again and watch the new result.

## The parts of the screen

| Part | Location | What it does |
|---|---|---|
| **Grammar** button | Top right | Shows the rules of the PiGPL language |
| **Report** button | Top right | Downloads a text file with all the results |
| **JSON** button | Top right | Downloads all the results as a JSON data file |
| **Compile** button | Top right | Compiles and runs the program in the editor |
| Example menu | Left panel, top | Loads a sample program into the editor |
| Editor | Left panel | The area where you write your program |
| Status line | Left panel, bottom | Shows "Valid" and some counts, or the number of errors |
| Stage tabs | Right side, top | One tab for each stage of the compiler, plus an **Errors** tab |
| Stage view | Right side, middle | Shows the result of the selected stage |
| Replay bar | Right side, bottom | Plays, stops and moves through the compile steps |

The **Errors** tab shows a red number when the program has errors.

## Use the replay controls

The compiler does its work in many small actions. Each small action is an **event**. For example, the compiler reads one word of your program. That is one event.

The app records all the events. The replay bar shows them again, one by one, in the same order.

| Control | What it does |
|---|---|
| Reset button (circular arrow) | Moves to the first event |
| Back button (`<`) | Moves back one event |
| Play / Pause button | Starts or stops the replay |
| Forward button (`>`) | Moves forward one event |
| Timeline slider | Drag it to go to any event |
| Counter (for example `12/240`) | Shows the current event number and the total number of events |
| Speed slider | Makes the replay faster or slower |

You can also use the keyboard:

| Key | What it does |
|---|---|
| `Space` | Starts or stops the replay |
| `→` (right arrow) | Moves forward one event |
| `←` (left arrow) | Moves back one event |

The keys do not work while the cursor is in the editor. Click outside the editor first.

**How the tabs follow the replay:** When you press Play, the app opens the tab for each event automatically. When you click a tab yourself, the replay stops. The app then shows the full result of that stage. Press Play to make the tabs follow the replay again.

## The compiler stages

The compiler does its work in stages. Each stage uses the result of the stage before it.

```text
Source → Tokens → Parser → AST → Symbols → Semantic → TAC → Optimize → Execute
```

### 0 · Source

This tab shows your program with line numbers. The app marks the part of the code that the current event uses.

### 1 · Lexer and 2 · Tokens

The **lexer** reads your program one character at a time. It puts the characters into groups called **tokens**. A token is one word, number or symbol of the program. Each token has a type.

For example, the line `let x: int = 10` gives these tokens:

| Text | Token type |
|---|---|
| `let` | LET |
| `x` | IDENTIFIER (a name) |
| `:` | COLON |
| `int` | TYPE |
| `=` | ASSIGN |
| `10` | INTEGER |

These two tabs show the same view. Your program is at the top, and the tokens are below it.

### 3 · Parser

The **parser** reads the tokens and checks them against the grammar rules of PiGPL. It then builds a tree from the tokens. This tab shows the tree and a list of the grammar rules that the parser used.

### 4 · AST

AST means "abstract syntax tree". The AST is a tree diagram of your program. Each box is one part of the program. For example, `x + y` gives a `+` box with two child boxes: `x` and `y`.

The tree shows the order of the math. In `a + b * c`, the `*` box is lower in the tree than the `+` box. So the compiler multiplies first.

### 5 · Symbols

The **symbol table** lists every name that your program declares. The table has these columns:

| Column | Meaning |
|---|---|
| Name | The name of the variable or function |
| Type | The type, for example `int` or `fn(int,int)->int` |
| Scope | The part of the program where the name is valid |
| Kind | `var` (variable), `param` (function input), `fn` (function) or `loop` (loop variable) |
| Value | The start value, when it is a plain value such as `10` |

Scope values look like this:

- `global` is the main part of the program.
- `fn:add` is the inside of the function `add`.
- `for:i:7` is the inside of a loop that uses the variable `i`.

### 6 · Semantic

The semantic stage checks that your program makes sense. Here are some of the things it checks:

- Every name has a declaration before you use it.
- Each value has the correct type.
- Each `if` and `while` condition is `true` or `false`.
- Each function call has the correct number of inputs.

Each check shows a green tick (✓) when it passes, or a red cross (✗) when it fails. If a check fails, the program does not run.

### 7 · TAC

TAC means "three-address code". TAC is a list of very simple instructions. Each instruction does one small action. The compiler changes your program into TAC.

The table has these columns: `#` (line number), `Result`, `Op` (the action), `Arg1` and `Arg2` (the inputs).

In TAC, these names have special meanings:

- `t0`, `t1`, `t2` … are **temporary values**. The compiler makes them to hold results in the middle of a calculation.
- `L0`, `L1` … are **labels**. A label marks a place in the code. The code can jump to a label. Loops and `if` statements use labels.
- `func main()` and `endfunc main` mark the start and the end of the main program.

For example, `let x: int = 2 + 3 * 4` gives this TAC:

```text
func main()
t0 = 2
t1 = 3
t2 = 4
t3 = t1 * t2
t4 = t0 + t3
x = t4
print x
endfunc main
```

### 8 · Optimize

The **optimizer** makes the TAC shorter and faster. The result of the program stays the same. This tab shows the old TAC on the left and the new TAC on the right. Below them is a list of each change.

The optimizer makes these types of changes:

| Change | What it does | Example |
|---|---|---|
| `fold` | Calculates math with known numbers now, not when the program runs | `3 * 4` becomes `12` |
| `propagate` | Puts a known value in the place of its name | `t3` becomes `12` |
| `algebraic` | Removes math that does nothing | `x * 1` becomes `x`, and `x + 0` becomes `x` |
| `dce` | Removes values that the program never uses | The optimizer removes `t0 = 2` |

After these changes, the example above becomes:

```text
func main()
x = 14
print x
endfunc main
```

### 9 · Execute

The app runs the optimized TAC. This tab shows the output of the program, line by line.

### Errors

This tab lists each error. Each error shows the stage, the message, the line number and the column number.

### Grammar

This tab shows the grammar rules of PiGPL. The parser uses these rules.

## Write PiGPL programs

### A short example

```text
# This program adds two numbers and prints a message
let x: int = 10
let y: int = 20
let z: int = x + y

if z > 20 {
    print("Greater")
} else {
    print("Not greater")
}
```

This program prints `Greater`.

### General rules

- Write one statement on each line.
- Use curly brackets `{ }` to make a block of code. Spaces at the start of a line have no effect. Use them only to make the code easy to read.
- A `#` starts a comment. The compiler ignores the text from `#` to the end of the line.
- Upper-case and lower-case letters are different. `Total` and `total` are two different names.

### Names

- A name starts with a letter or an underscore (`_`).
- After the first character, a name can contain letters, digits and underscores.
- Some words have a special meaning in PiGPL. You cannot use them as names:

  ```text
  let  int  float  bool  string  list  if  elif  else  for  while
  in  fn  return  print  input  true  false  and  or  not
  ```

### Types

| Type | Meaning | Examples |
|---|---|---|
| `int` | A whole number | `10`, `0`, `-3` |
| `float` | A number with a decimal point | `3.14`, `0.5` |
| `bool` | True or false | `true`, `false` |
| `string` | Text in double quotes | `"Hello"` |
| `list` | A group of values in square brackets | `[10, 20, 30]` |

For a `float`, write at least one digit on each side of the point. Write `0.5`, not `.5`.

In a string, you can use these special codes:

| Code | Meaning |
|---|---|
| `\n` | New line |
| `\t` | Tab space |
| `\"` | A double quote |
| `\\` | A backslash |

A string must start and end on the same line.

### Variables

Use `let` to make a new variable. You must give the name, the type and a start value:

```text
let age: int = 20
let price: float = 9.99
let name: string = "Ravi"
let ready: bool = true
let scores: list = [80, 95, 70]
```

To change the value of a variable, use `=` without `let`:

```text
age = age + 1
```

You cannot use `let` two times for the same name in the same block. Use `let` one time, then use `=` for each new value.

### Print

`print` shows one value on the output:

```text
print(42)
print("Hello")
print(age)
```

`print` accepts only one value. To print two strings together, join them with `+`:

```text
print("Hello, " + name)
```

### Math

| Operator | Meaning | Example | Result |
|---|---|---|---|
| `+` | Add (or join two strings) | `7 + 2` | `9` |
| `-` | Subtract | `7 - 2` | `5` |
| `*` | Multiply | `7 * 2` | `14` |
| `/` | Divide | `8 / 2` | `4` |
| `%` | Remainder after division | `7 % 2` | `1` |

The compiler does `*`, `/` and `%` before `+` and `-`. Use round brackets `( )` to change this order. For example, `2 + 3 * 4` is `14`, but `(2 + 3) * 4` is `20`.

If you use an `int` and a `float` together, the result is a `float`.

If you divide an `int` by an `int`, the result is a whole number. The app removes the part after the decimal point. For example, `7 / 2` gives `3`, but `7.0 / 2.0` gives `3.5`.

If you divide by zero, the program stops with a runtime error.

You can join two strings with `+`. You cannot join a string and a number. `"a" + 1` gives an error.

### Comparisons

| Operator | Meaning |
|---|---|
| `==` | Is equal to |
| `!=` | Is not equal to |
| `<` | Is less than |
| `>` | Is greater than |
| `<=` | Is less than or equal to |
| `>=` | Is greater than or equal to |

A comparison gives `true` or `false`. You can use `<`, `>`, `<=` and `>=` only with numbers.

### Logic

| Word | Meaning | Example |
|---|---|---|
| `and` | Both sides must be true | `a > 0 and b > 0` |
| `or` | One side or both sides must be true | `a > 0 or b > 0` |
| `not` | Changes true to false, and false to true | `not (a == b)` |

### If, elif and else

```text
let score: int = 75

if score >= 90 {
    print("A")
} elif score >= 70 {
    print("B")
} else {
    print("C")
}
```

The program tests each condition in order. It runs the block of the first condition that is true. If no condition is true, it runs the `else` block. The `elif` and `else` parts are optional.

Each condition must be `true` or `false`. `if score {` gives an error, because `score` is a number. Write `if score > 0 {` instead.

### While loops

A `while` loop runs its block again and again while its condition is true:

```text
let n: int = 5
while n > 0 {
    print(n)
    n = n - 1
}
print("done")
```

This program prints `5`, `4`, `3`, `2`, `1` and then `done`.

Make sure that the condition becomes false at some point. If it does not, the loop does not stop. The app stops a program after 8000 steps.

### For loops

A `for` loop runs its block one time for each item:

| You write | The loop variable gets |
|---|---|
| `for i in 5` | `0`, `1`, `2`, `3`, `4` |
| `for v in [10, 20, 30]` | `10`, `20`, `30` |
| `for c in "abc"` | `"a"`, `"b"`, `"c"` |

Example:

```text
let sum: int = 0
for i in 5 {
    sum = sum + i
}
print(sum)
```

This program prints `10` (0 + 1 + 2 + 3 + 4).

The loop variable exists only inside the loop. If you use `i` after the loop, you get an error.

### Lists

```text
let xs: list = [10, 20, 30]
print(xs[0])
xs[1] = 99
print(xs)
```

- The first item has the number `0`. So `xs[0]` is `10`.
- To change an item, write `xs[1] = 99`.
- `print(xs)` prints the full list: `[10, 99, 30]`.
- The number in the square brackets must be an `int`.

### Functions

A function is a named block of code that you can use many times:

```text
fn add(a: int, b: int) -> int {
    return a + b
}

let s: int = add(4, 7)
print(s)
```

This program prints `11`.

- Start with `fn`, then the function name.
- In the round brackets, give each input a name and a type.
- After `->`, give the type of the result. If the function gives no result, do not write `->`.
- Use `return` to send the result back.
- Write the function before the line that uses it.
- A function can read and change the variables of the main program. A `let` inside a function makes a new variable that only the function can use.
- When you call a function, give the correct number of inputs.
- A function can call itself. The "Factorial" sample program shows this.

### Input

`input()` gives a `string`:

```text
let name: string = input()
```

**Note:** The app does not ask you to type text. In this app, `input()` always gives empty text (`""`).

## Error messages

Each error has a stage name. The stage name tells you which part of the compiler found the error.

| Stage name | Meaning |
|---|---|
| Lexical | The lexer found a character that PiGPL does not use |
| Syntax | The parser found tokens in an order that the grammar does not allow |
| Semantic | The program has a correct form, but it does not make sense (for example, a wrong type) |
| Runtime | A problem occurred while the program ran |

If your program has an error before the Execute stage, the program does not run.

Some errors cause more errors after them. Always correct the first error first. Then click **Compile** again.

### Common errors and how to correct them

| Message | Cause | How to correct it |
|---|---|---|
| `Invalid character '@'` | The program contains a character that PiGPL does not use | Remove the character |
| `Unterminated string literal` | A string has no closing `"` | Add the closing `"` on the same line |
| `Expected ... found ...` | A part of the statement is missing or in the wrong place | Compare the line with the examples in this guide |
| `Unexpected token ...` | The parser did not expect this token here | Check the line and the line before it |
| `Undeclared identifier: y` | You used `y` before you declared it | Add `let y: int = ...` above that line |
| `Identifier 'x' is already declared` | You used `let` two times for `x` | Use `x = ...` for the second value |
| `Type mismatch in declaration ...` | The value does not agree with the type | Change the type or the value |
| `Condition must be bool, found int` | An `if` or `while` condition is a number | Use a comparison, for example `x > 0` |
| `Operator '+' requires numeric operands ...` | You added a number to text | Use two numbers, or two strings |
| `Function expected 2 argument(s), got 1` | A call has the wrong number of inputs | Give the correct number of inputs |
| `Division by zero` | The number after `/` or `%` is `0` | Make sure that the number is not `0` |
| `return outside of a function` | A `return` is not inside a function | Remove the `return`, or move it into a function |
| `Execution stopped after 8000 steps (possible infinite loop)` | The program ran for too long. A loop may not stop. | Make sure the loop condition becomes false |

## Save and export your work

- **Automatic save:** When you click **Compile**, the app saves your program in your browser. The next time you open the app, it loads your program again.
- **Report:** Click **Report** to download the file `pigpl-report.txt`. This file contains your program, the tokens, the symbol table, the checks, the TAC, the optimized TAC, the output and the errors.
- **JSON:** Click **JSON** to download the file `pigpl-compile.json`. This file contains the same results in a data format that other programs can read.

## Sample programs

Use the example menu above the editor to load a sample program.

| Sample | What it shows |
|---|---|
| If / else | Variables, math and an `if`/`else` choice |
| Basic | One variable and one `print` |
| Arithmetic | The order of the math operators |
| Constant fold | The optimizer changes `2 + 3 * 4` to `14` |
| While | A loop that counts down |
| For range | A `for` loop from `0` to `4` |
| Lists | Lists, items and a loop over a list |
| Functions | A function with inputs and a result |
| Factorial | A function that calls itself |
| Logic | `and`, `or`, `not` and `elif` |
| Lexical error | A character that PiGPL does not use |
| Syntax error | A declaration that has no value |
| Semantic error | A name that has no declaration |

## Known limits

The app has these limits:

- **A list index outside the list gives `0`.** For example, if `xs` is `[1, 2]`, then `xs[5]` gives `0`. The app does not show an error for it.
- **`input()` always gives empty text.** The app does not ask you to type.
- **`print` shows only one value.**
- **There is no way to change a number into text.**
- **A program can run for 8000 steps at most.**
- **The "Lexical error" sample shows two errors.** The lexer removes the bad character. The parser then finds `10 5`, which is also an error.

## Project files

The compiler is in three places. The other folders hold the web app framework and are not necessary to learn about the compiler.

```text
src/
├── compiler/                 The compiler (one file for each stage)
│   ├── lexer.ts              Stage 1: makes tokens from the text
│   ├── parser.ts             Stage 3: builds the tree from the tokens
│   ├── ast.ts                The parts of the tree (AST)
│   ├── symbol-table.ts       Keeps the list of names and their scopes
│   ├── semantic.ts           Stage 6: checks types and names
│   ├── ir.ts                 Stage 7: makes the TAC
│   ├── optimizer.ts          Stage 8: makes the TAC shorter
│   ├── execute.ts            Stage 9: runs the TAC
│   ├── pipeline.ts           Runs all the stages in order
│   ├── events.ts             Records each event for the replay
│   ├── examples.ts           The sample programs and the grammar rules
│   ├── export.ts             Makes the Report and JSON files
│   ├── types.ts              Shared data shapes and the list of stages
│   └── pipeline.test.ts      Tests for the compiler
├── components/compiler/      The screen parts
│   ├── studio.tsx            The main screen: editor, tabs and replay bar
│   ├── stage-views.tsx       The view for each stage tab
│   └── ast-tree.tsx          Draws the AST diagram
└── lib/studio-store.ts       Keeps the state of the app (program, result, replay position)
```

## Commands

Run these commands in a terminal in the project folder:

| Command | What it does |
|---|---|
| `npm install` | Installs the packages (one time only) |
| `npm run dev` | Starts the app at <http://localhost:8080> |
| `npm test` | Runs all the tests |
| `npm run typecheck` | Checks the TypeScript code for type errors |
| `npm run lint` | Checks the code style |
| `npm run build` | Makes the final version of the app for a web server |
| `npm run preview` | Starts the final version at <http://localhost:8081> (run `npm run build` first) |

## Words used in this guide

| Word | Meaning |
|---|---|
| Compiler | A program that reads code and changes it into a form that a computer can run |
| Compile | To use a compiler on a program |
| Event | One small action of the compiler, which the replay shows |
| Token | One word, number or symbol of a program, with its type |
| Lexer | The part of the compiler that makes tokens from the text |
| Parser | The part of the compiler that builds a tree from the tokens |
| AST (abstract syntax tree) | A tree diagram of the parts of a program |
| Grammar | The rules that tell which programs have a correct form |
| Symbol table | A list of all the names in a program, with their types |
| Scope | The part of a program where a name is valid |
| Semantic check | A check that the program makes sense, for example that the types agree |
| TAC (three-address code) | A list of very simple instructions that the compiler makes from the tree |
| Temporary value | A value such as `t0` that holds a result in the middle of a calculation |
| Label | A name such as `L0` that marks a place in the TAC |
| Optimizer | The part of the compiler that makes the TAC shorter |
| Declare | To make a new name with `let` or `fn` |
