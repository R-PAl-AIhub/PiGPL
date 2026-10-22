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
15. [Project documentation: change report](#project-documentation-change-report)

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
- Each function that gives a result returns a value on every path.
- Each function is at the top level of the program.

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

This tab lists each error. Each error shows the stage, the message, the line number and the column number. It also shows the line of your program, with a `^` mark under the place of the error.

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

A `float` variable can hold an `int`. An `int` variable cannot hold a decimal value. For example, `let x: int = 1.5` gives an error. Declare `x` as a `float` instead.

The largest `int` is 9007199254740991. The smallest `int` is -9007199254740991. A whole number outside this range gives an error, because the app cannot store it exactly.

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

To get a decimal result, write one of the numbers with a decimal point. For example, `7 / 2.0` gives `3.5`.

If you divide by zero, the program stops with a `Division by zero` error. This is true for `/` and for `%`.

An `int` result must stay exact. If `+`, `-` or `*` gives an `int` above 9007199254740991 or below -9007199254740991, the program stops with an `Integer overflow` error. A `float` has no such check.

The remainder `%` takes the sign of the left number. For example, `-7 % 3` is `-1`.

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

Make sure that the condition becomes false at some point. If it does not, the loop does not stop. A step is one TAC instruction. The app stops a program after 10,000,000 steps and shows an error.

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
- A valid index is from `0` to the number of items minus one. Any other index gives a `Runtime` error. For example, `xs[3]` gives an error when `xs` has three items.
- You cannot add an item with an index. `xs[3] = 1` gives an error when `xs` has three items.
- A list is a value. After `let b: list = a`, a change to `b` does not change `a`.
- A list can hold lists. For example, `m[1][0]` reads the first item of the second list in `m`.
- You cannot change an item inside a nested list. `m[1][0] = 5` gives an error. Build a new list instead.
- Two lists are equal when they have the same items. For example, `[1, 2] == [1, 2]` is `true`.
- You can use list items in math, comparisons and conditions. The app cannot know the type of a list item before the program runs. It checks the type while the program runs. A wrong type gives a `Runtime` error.
- If you divide a list item, the result is a decimal number.

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
- A function that gives a result must return a value on every path. A `while` loop does not count, because the loop can run zero times.
- Define a function at the top level of the program. You cannot define a function inside another function, a loop or an `if`.
- You can call a function before or after its definition. Two functions can call each other.
- A function can read and change the variables of the main program. It can use only the variables that you declare above it. A `let` inside a function makes a new variable that only the function can use.
- A function cannot see the local variables of the function that called it.
- When you call a function, give the correct number of inputs.
- A function can call itself. The "Factorial" sample program shows this. A chain of calls can be 1,000 calls deep at most.

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
| Limit | The program, or the number of errors, is too large for the compiler |
| Internal | The compiler failed in an unexpected way. This is a bug in PiGPL |

If your program has a Lexical, Syntax or Semantic error, the program does not run.

Some errors cause more errors after them. For example, the app removes an invalid character, and the code around it can then break a grammar rule. Always correct the first error first. Then click **Compile** again. The app shows 100 errors at most.

### Common errors and how to correct them

| Message | Cause | How to correct it |
|---|---|---|
| `Invalid character '@'` | The program contains a character that PiGPL does not use | Remove the character |
| `Invalid character '!' (use 'not' ...)` | The character belongs to another language. The message in brackets names the PiGPL form | Use the form that the message names |
| `Invalid character U+00A0 (a non-breaking space ...)` | An invisible character came in with copied text | Replace it with a normal space |
| `Unterminated string literal (add a closing " ...)` | A string has no closing `"` | Add the closing `"` on the same line |
| `Integer literal ... is too large` | A whole number is above 9007199254740991 | Use a smaller number |
| `Expected ')' to close 'print(', found ...` | A part of the statement is missing or in the wrong place | Add the part that the message names |
| `Expected '}' to close the block opened at line 3` | A block has no closing `}` | Add the `}` |
| `Unexpected '}': there is no matching '{'` | A `}` has no `{` before it | Remove the `}` or add the `{` |
| `'else' has no matching 'if'` | An `else` or `elif` does not follow an `if` block | Move it behind the `if` block |
| `A statement cannot start with '5'` | A line starts with a token that no statement uses | Start the line with `let`, `if`, `while`, `for`, `fn`, `return`, `print` or a name |
| `print() takes exactly one value` | `print` got two values | Join the values with `+` |
| `Code is nested too deeply` | Brackets or blocks are more than 100 levels deep | Split the code into steps |
| `Expression is nested too deeply` | One expression chains more than 1,000 operators | Split the expression into steps |
| `Undeclared identifier: cuont (did you mean 'count'?)` | You used a name before you declared it, or you made a typing error | Declare the name, or correct the spelling |
| `Identifier 'x' is already declared` | You used `let` two times for `x` | Use `x = ...` for the second value |
| `Type mismatch in declaration of 'x': expected int, found float ...` | A decimal value does not fit in an `int` variable | Declare the variable as `float` |
| `Condition must be bool, found int (use a comparison ...)` | An `if` or `while` condition is a number | Use a comparison, for example `x > 0` |
| `Operator '+' requires numeric operands ...` | You added a number to text | Use two numbers, or two strings |
| `Function 'add' expects 2 arguments but got 1` | A call has the wrong number of inputs | Give the correct number of inputs |
| `Function 'f' must return a value of type int on every path` | Some path through the function has no `return` | Add a `return` at the end of the function |
| `Functions can only be defined at the top level ...` | A function is inside another function, a loop or an `if` | Move the function to the top level |
| `print() needs a value, but this function call returns nothing` | You printed the result of a function that gives no result | Print a value instead |
| `Only a list variable can be changed by index ...` | You wrote `m[0][1] = 5` | Build a new list instead |
| `return outside of a function` | A `return` is not inside a function | Remove the `return`, or move it into a function |
| `Division by zero` | The number after `/` or `%` is `0` | Make sure that the number is not `0` |
| `Integer overflow: the result does not fit in an int` | `+`, `-` or `*` gave an `int` above 9007199254740991 or below -9007199254740991 | Use a `float`, or use smaller numbers |
| `List index 3 is out of range. The list has 3 items, so valid indexes are 0 to 2.` | The index is outside the list | Use an index that the message names as valid |
| `Operator '+' needs two numbers or two strings, found number and string` | A list item has a different type than you expected | Check the items of the list |
| `Maximum call depth of 1,000 exceeded ...` | A function calls itself without a stop | Add a case that ends the calls |
| `Output limit of 10,000 lines reached ...` | The program prints too many lines | Check for a loop that never ends |
| `Execution stopped after 10,000,000 steps (possible infinite loop)` | The program ran for too long. A loop may not stop. | Make sure the loop condition becomes false |
| `Source is too large ...` | The program has more than 250,000 characters | Split the program |
| `Too many errors (250); showing the first 100 ...` | The program has more than 100 errors | Correct the first errors and compile again |

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
| Runtime error | A list index past the end of the list |

## Known limits

The app has these limits:

- **Size limits.** A program can have 250,000 characters at most. Brackets and blocks can be 100 levels deep. One expression can chain 1,000 operators. A chain of calls can be 1,000 deep. A program can print 10,000 lines and run 10,000,000 steps. The app shows 100 errors at most.
- **The range of an `int`.** An `int` is exact from -9007199254740991 to 9007199254740991. A result outside this range gives an `Integer overflow` error.
- **A float with a whole value prints without `.0`.** For example, `print(2.0)` prints `2`.
- **Division of a list item gives a decimal result.** The app cannot know before the run if the item is an `int`.
- **A function can use only the variables declared above it.** A function can call any top-level function, before or after its definition.
- **You cannot change an item inside a nested list.** `m[0][1] = 5` gives an error.
- **`input()` always gives empty text.** The app does not ask you to type.
- **`print` shows only one value.**
- **There is no way to change a number into text.**
- **One mistake can cause more than one error.** The "Lexical error" sample shows two errors. The lexer removes the bad character. The parser then finds `10 5`, which is also an error.

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
│   ├── pipeline.test.ts      Basic tests for the compiler
│   └── robustness.test.ts    Tests with valid, invalid, boundary, error and complex input
├── components/compiler/      The screen parts
│   ├── studio.tsx            The main screen: editor, tabs and replay bar
│   ├── stage-views.tsx       The view for each stage tab
│   └── ast-tree.tsx          Draws the AST diagram
└── lib/studio-store.ts       Keeps the state of the app (program, result, replay position)

scripts/benchmark.mjs         Measures the time and memory of the compiler (npm run bench)
```

## Commands

Run these commands in a terminal in the project folder:

| Command | What it does |
|---|---|
| `npm install` | Installs the packages (one time only) |
| `npm run dev` | Starts the app at <http://localhost:8080> |
| `npm test` | Runs all the tests |
| `npm run bench` | Measures the time and memory of the compiler (see the change report) |
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
| Runtime error | An error that happens while the program runs |
| Overflow | A result that is too large to store exactly |
| Step | One TAC instruction that the app runs |
| Benchmark | A test that measures speed and memory use |

## Project documentation: change report

This section records the work on testing, error messages and performance. It lists what the work found, what changed, and how to repeat each check. It is for people who maintain the compiler.

### Summary

| Area | Before | After |
|---|---|---|
| Automatic tests | 71 | 169. The new file `src/compiler/robustness.test.ts` holds 98 of them |
| Input that crashed the compiler | Deep or long input threw an uncaught error | None. The compiler returns a clear error |
| Problems in the compiler | 20 found (see the problem table) | All 20 corrected |
| Error messages | Token names and wrong positions in many messages | Plain words, exact positions and hints |
| Compile time of 5,000 declarations | About 206 ms | About 106 ms |
| Step limit of one run | 8,000 | 10,000,000 |
| Memory of 128,000 characters | 47 MB | 47 MB. A size limit now bounds it |
| Type check, lint, tests and build | All passed | All pass |

### 1. Testing

The tests call `compile()` with one program and check the output, the errors, or both. The expected results come from the language rules in this guide. The work began with a probe of about 60 small programs. The probe showed which parts of the compiler were wrong. The tests then set the expected result of each case before the code changed.

The tests are in `src/compiler/robustness.test.ts`. The `test` script in `package.json` runs them.

| Group | Tests | What the group covers |
|---|---|---|
| Valid inputs | 15 | Empty programs, line endings, every type of value, precedence, division, strings, lists, loops, functions |
| Scope rules | 5 | Global and local variables, recursion, loop variables |
| Invalid input: lexical errors | 6 | Position, hints, emoji, unterminated strings, large numbers |
| Invalid input: syntax errors | 12 | Wording, position, one error for one mistake, no token names |
| Invalid input: semantic errors | 16 | Names, types, calls, returns, nested functions, lists |
| Boundary cases | 17 | Largest `int`, overflow, first and last index, empty lists, nesting limits, size limit |
| Runtime error conditions | 9 | Division by zero, wrong types, endless loops, endless recursion, output limit |
| Complex programs | 10 | Sorting, a prime sieve, gcd, Collatz, Fibonacci, binary search, nested lists |
| Pipeline invariants | 5 | Links between events and results, repeatable results, 400 random programs, 560 damaged copies of the samples |
| Performance | 3 | Compile time, growth with program size, a 100,000-iteration loop |

The random programs and the damaged samples must meet four rules. No call throws. No result has an `Internal` error. Every event link is valid. Every lexical, syntax and semantic error has a line and a column.

#### Problems found and corrected

| # | Input | Before | After |
|---|---|---|---|
| 1 | `print(((((…1…)))))` with 1,200 levels, or `1+1+…` with 3,000 terms | An uncaught `RangeError` stopped the compiler | A `Syntax` error: `Code is nested too deeply`. A safety net also catches any other crash |
| 2 | A function prints a global `x`, and another function with its own `x` calls it | Printed the caller's `x` (`2`) | Prints the global `x` (`1`) |
| 3 | A function defined inside another function | The inner body ran at the wrong time. The output was wrong | A `Semantic` error |
| 4 | A function with a result that has a path without `return` | Gave `0` without a message | A `Semantic` error |
| 5 | `print(f())` when `f` gives no result | Printed `0` | A `Semantic` error |
| 6 | `let x: int = 1.5` | Stored `1.5` in an `int` | A `Semantic` error with a hint |
| 7 | `[1, 2] == [1, 2]` | `false` | `true` |
| 8 | `s = s + v` with a list item `v`, or `m[1][0]` | Rejected: `requires numeric operands, found int and unknown` and `Cannot index type unknown` | Accepted. The executor checks the types. A wrong type, such as `xs[0] + "a"` with a number in `xs[0]`, gives a `Runtime` error |
| 9 | `xs[5]` or `xs[-1]` on a list of two items | Gave `0` | A `Runtime` error that names the valid indexes |
| 10 | `xs[7] = 1` on a list of two items | Made the list `[1, 2, , , , , , 1]` | A `Runtime` error |
| 11 | A loop of 1,000 iterations, `fib(20)`, a loop that prints 5,000 lines | Rejected after 8,000 steps | Runs. The limit is 10,000,000 steps |
| 12 | `print(!true)` | Reported a `Lexical` error and then ran the program | The program does not run after a lexical or syntax error |
| 13 | `print(99999999999999999999)` | Printed `100000000000000000000` | A `Lexical` error |
| 14 | `print(9007199254740991 + 2)` | Printed `9007199254740992`, which is wrong | An `Integer overflow` error |
| 15 | A source with an emoji | Two errors with broken half characters | One error that shows the emoji |
| 16 | A missing `)` at the end of the program | Error at line 1, column 1 | Error at the end of the program |
| 17 | `print(1, 2)` | Two errors that named token types | One error that explains `print` |
| 18 | `m[0][1] = 5` | An error with a misleading message: `Indexed assignment requires a list` | An error that explains that nested assignment is not supported |
| 19 | Two functions that call each other, or a call before the definition | `Undeclared identifier` | Works. The compiler declares all top-level functions first |
| 20 | A source of 5,000 invalid characters | 5,000 errors | 100 errors and a `Too many errors` message |

The "Before" column shows the code of commit `5629f17`. Two earlier corrections are not in this table. They come from the first review round, before that commit. They are a function that changes a global variable, and the `int / int` division with the `Division by zero` error. Every "Before" result in the table comes from a run of that code.

### 2. Error messages

These rules shaped each message:

- **Use plain words.** A message names the problem. It does not name a token type such as `RPAREN`.
- **Point at the exact place.** An error at the end of the program points at the end of the last line.
- **Say what is valid.** A range error names the valid indexes.
- **Give a hint for a common mistake.** The hints cover these characters: `!`, `&`, `|`, `'`, `;` and a leading `.`. They also cover curly quotes, a non-breaking space and a byte-order mark.
- **Suggest a name.** An unknown name shows the closest declared name when one is close.
- **Name the function.** A call error names the function that you called.
- **Report one mistake one time.** A second error at the same token does not appear.
- **Show the line.** The Errors tab shows the source line with a `^` mark.

| Input | Before | After |
|---|---|---|
| `print(1` | `Expected RPAREN, found EOF` at line 1, column 1 | `Expected ')' to close 'print(', found the end of the program` at line 1, column 8 |
| `if true {` with no `}` | `Expected '}' to close block` at line 1, column 1 | `Expected '}' to close the block opened at line 1, found the end of the program` at the last line |
| `5 + 3` | `Unexpected token '5' (INTEGER)` | `A statement cannot start with '5'. A statement starts with let, if, while, for, fn, return, print, a name, or a call` |
| `x` | `Unexpected identifier 'x' — expected assignment or call` | `'x' is not a statement. Use 'x = value' to assign, 'x(...)' to call, or 'let x: type = value' to declare` |
| `print(cuont)` | `Undeclared identifier: cuont` | `Undeclared identifier: cuont (did you mean 'count'?)` |
| `add(1)` | `Function expected 2 argument(s), got 1` | `Function 'add' expects 2 arguments but got 1` |
| `if 1 {` | `Condition must be bool, found int` | `Condition must be bool, found int (use a comparison such as x > 0)` |
| `return` with no value in a function with a result | `Function must return int` | `Function 'f' must return a value of type int, but this return has no value` |
| `print(!true)` | `Invalid character '!'` | `Invalid character '!' (use 'not' to negate a condition, or '!=' to compare two values)` |
| An emoji | `Invalid character '\ud83d'` and `'\ude00'` | `Invalid character '😀'` |
| `print('hi')` | `Invalid character '''` and `Undeclared identifier: hi` | Two errors that say `strings use double quotes` |
| `xs[5]` | No message. It gave `0` | `List index 5 is out of range. The list has 2 items, so valid indexes are 0 to 1.` |
| `m[0][1] = 5` | `Indexed assignment requires a list` | `Only a list variable can be changed by index, as in xs[0] = 1. Changing an item inside a nested list is not supported` |
| An endless loop | `Execution stopped after 8000 steps` | `Execution stopped after 10,000,000 steps (possible infinite loop)` |

### 3. Performance

#### Method

`npm run bench` compiles 13 generated programs. It runs each program 7 times and reports the median time. It then measures the memory that the result keeps after a garbage collection. The same script ran on the original code (commit `5629f17`) and on the new code, on one machine with Node v24.18.0. Times change from run to run by up to 20 percent. The compile-time rows below use the median of 4 repeated runs.

#### Compile time and memory

| Program | Time before | Time after | Memory before | Memory after |
|---|---|---|---|---|
| 1,000 declarations (23,792 characters) | About 29 ms | About 19 ms | 10.5 MB | 10.5 MB |
| 5,000 declarations (127,793 characters) | About 206 ms | About 106 ms | 47.2 MB | 47.0 MB |

#### Execution

| Program | Before | After |
|---|---|---|
| Loop that sums 1,000 numbers | Error at 8,000 steps | Runs in 0.9 ms |
| Loop that sums 100,000 numbers | Error at 8,000 steps | Runs in 25 ms |
| `fib(10)` | 1.3 ms | 0.8 ms |
| `fib(20)` | Error at 8,000 steps | Runs in 10 ms |
| `fib(27)` | Error at 8,000 steps | Runs in 439 ms |
| List of 300 items, sum in a loop | `Semantic` error | Runs in 3.6 ms |
| 5,000 print lines | Error at 8,000 steps | Runs in 2.9 ms |
| Endless `while true` loop | Stopped at 8,000 steps | Stopped at 10,000,000 steps after 261 ms |

The executor runs 20 to 40 million steps each second. The slower figure is a loop that calls a function.

#### Where the time went

The per-phase timing of 5,000 declarations showed the cause. The semantic phase took 85 to 135 ms, which is about half of the compile time. Each lookup of a name scanned every symbol that the program declared before. After the change, the semantic phase takes 8 to 10 ms. The optimizer is now the largest phase, at about 70 ms.

#### What changed for speed

- **Symbol table.** One map for each scope replaces the scan. A lookup now costs one read for each open scope.
- **Lexer.** Character tests use character codes, not regular expressions.
- **Optimizer.** `parseConst` and `isTemp` return early for ordinary names.
- **Executor, constants.** The executor parses constant operands one time, before the run. It no longer parses them on each step.
- **Executor, variables.** A lookup reads two maps: the current frame and the global frame. Before, it walked every frame on the stack. This change also corrected problem 2.
- **Executor, memory.** The recorded trace keeps the first 5,000 steps and every print. A long run no longer fills memory with one object for each step.

#### Accuracy

- `int / int` gives an `int`. The new `//` instruction does this division.
- `+`, `-` and `*` on `int` values stop with `Integer overflow` when the result is not exact. The optimizer does not fold such a result, so it cannot hide the error.
- Lists compare by content.
- A literal above 9007199254740991 gives an error.

#### Limits and why

| Limit | Value | Reason |
|---|---|---|
| Steps in one run | 10,000,000 | The run takes under half a second on the test machine, and the page waits for it |
| Depth of calls | 1,000 | The frame stack must not grow without bound. A depth of 990 runs |
| Printed lines | 10,000 | Each line becomes one event in the replay |
| Recorded trace | 5,000 steps | Memory must not grow with the number of steps |
| Depth of brackets and blocks | 100 | The stack overflowed at 1,200 levels in the test. The limit keeps a wide margin |
| Operators in one expression | 1,000 | The stack overflowed at 3,000 terms in the test. The limit keeps a margin of 3 times |
| Characters in a source | 250,000 | The replay events of 128,000 characters use 47 MB. 250,000 characters need about 92 MB (scaled from this value) |
| Reported errors | 100 | A long run of invalid characters must not flood the screen |

#### Not changed

- **The optimizer.** It is now the slowest phase. Its work grows in step with the program size. This work does not change it.
- **The memory of replay events.** The replay needs one event for each action. This is the main feature of the app, and it uses most of the memory.
- **List updates.** An update copies the list, so a list stays a value. The cost of one update grows with the length of the list.

### 4. Changes in behavior

These changes can make a program that worked before fail, or give it a different output. Most changes make the compiler report a mistake that it hid before.

1. An `int` variable no longer accepts a decimal value.
2. A function reads the global variable, not a variable of the function that called it.
3. A function inside another function, a loop or an `if` is an error.
4. A function with a result must return a value on every path.
5. `print(f())` is an error when `f` gives no result.
6. A list index outside the list is a `Runtime` error. It gave `0` before.
7. A lexical error now stops the compile. The TAC and Optimize tabs stay empty for such a program.
8. The step limit is 10,000,000. The limits in the "Limits and why" table are new.
9. `compile()` never throws. It returns an error with the phase `Limit` or `Internal`.
10. The error phase has two new values: `Limit` and `Internal`.
11. Many messages have new words. A script that matches an old message must change.
12. A new sample program, "Runtime error", joins the 13 samples.

### 5. Files changed

| File | Change |
|---|---|
| `src/compiler/lexer.ts` | Character codes, hints, whole code points, integer range, shared error helper |
| `src/compiler/parser.ts` | Plain messages, real end position, one error for one mistake, recovery from a stray `else`, nesting and depth limits |
| `src/compiler/symbol-table.ts` | One map for each scope, `visibleNames()` |
| `src/compiler/semantic.ts` | Unknown type, int and float rules, declared-first functions, nested functions, return paths, new messages, name suggestions |
| `src/compiler/ir.ts` | The `//` instruction and the `assign` and `int` markers |
| `src/compiler/optimizer.ts` | The `//` operator, no folding of an overflow, variables forgotten after a call, early returns |
| `src/compiler/execute.ts` | New scope rules, constants parsed one time, run-time checks, limits, capped trace |
| `src/compiler/pipeline.ts` | Stops after a front-end error, size limit, error limit, safety net |
| `src/compiler/types.ts` | Two new error phases, a note on `Quad.args` |
| `src/compiler/examples.ts` | The "Runtime error" sample |
| `src/components/compiler/stage-views.tsx` | The source line and `^` mark in the Errors tab |
| `src/compiler/robustness.test.ts` | New. 98 tests |
| `scripts/benchmark.mjs` and `package.json` | New benchmark and the `npm run bench` script, new test file in `npm test` |
| `README.md` | Updated guide and this report |

### 6. Verification

| Check | Command | Result |
|---|---|---|
| Tests | `npm test` | 169 of 169 pass |
| Type check | `npm run typecheck` | 0 errors |
| Lint | `npm run lint` | 0 errors and 0 warnings |
| Production build | `npm run build` | Passes |
| Browser check | `npm run dev` | The Errors tab shows the message, the line and the `^` mark. The console has no errors |
| Benchmark | `npm run bench` | The tables in section 3 |

### 7. How to repeat the checks

```bash
npm test            # all tests
npm run typecheck   # type check
npm run lint        # style check
npm run bench       # time and memory
```

To compare with the original code, make an empty folder and run `git archive 5629f17 src/compiler | tar -x -C <folder>`. Copy `scripts/benchmark.mjs` into a `scripts` folder inside it. Run `node --expose-gc --experimental-strip-types scripts/benchmark.mjs` there.

### 8. Known problems that remain

- The optimizer is the slowest phase for large programs.
- The replay events use most of the memory. A source of 250,000 characters needs about 92 MB.
- One lexical error can cause later syntax errors.
- A float with a whole value prints without `.0`.
- A function can use only the variables that you declare above it.
- `input()` returns empty text.
