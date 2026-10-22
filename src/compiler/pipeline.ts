import { toTree, type Program, type TreeNode } from "./ast.ts";
import { EventLog } from "./events.ts";
import { execute } from "./execute.ts";
import { generateIR } from "./ir.ts";
import { tokenize } from "./lexer.ts";
import { optimize } from "./optimizer.ts";
import { parse } from "./parser.ts";
import { analyze } from "./semantic.ts";
import type {
  CompilerError,
  ExecutionResult,
  OptimizationStep,
  PipelineEvent,
  Quad,
  SemanticCheck,
  SymbolEntry,
  Token,
} from "./types.ts";

/** Longest source the compiler accepts. About 130,000 characters of code keeps roughly 50 MB of replay events. */
export const MAX_SOURCE_CHARS = 250_000;
/** Most errors reported. One bad character repeated thousands of times must not flood the screen. */
const MAX_REPORTED_ERRORS = 100;

export interface CompileResult {
  source: string;
  tokens: Token[];
  ast: Program | null;
  tree: TreeNode | null;
  symbols: SymbolEntry[];
  checks: SemanticCheck[];
  ir: Quad[];
  optimizedIr: Quad[];
  optimizations: OptimizationStep[];
  execution: ExecutionResult | null;
  errors: CompilerError[];
  events: PipelineEvent[];
  phasesOk: Record<string, boolean>;
}

/** A result with no output, only an error: for input the compiler refuses or cannot process. */
function failedResult(source: string, error: CompilerError): CompileResult {
  return {
    source,
    tokens: [],
    ast: null,
    tree: null,
    symbols: [],
    checks: [],
    ir: [],
    optimizedIr: [],
    optimizations: [],
    execution: null,
    errors: [error],
    events: [],
    phasesOk: {
      lexer: false,
      parser: false,
      semantic: false,
      ir: false,
      optimize: false,
      execute: false,
    },
  };
}

/** Keep the first errors and say how many were left out. */
function capErrors(errors: CompilerError[]): CompilerError[] {
  if (errors.length <= MAX_REPORTED_ERRORS) return errors;
  const dropped = errors[MAX_REPORTED_ERRORS]!;
  return [
    ...errors.slice(0, MAX_REPORTED_ERRORS),
    {
      phase: "Limit",
      message: `Too many errors (${errors.length}); showing the first ${MAX_REPORTED_ERRORS}. Fix these and compile again.`,
      line: dropped.line,
      column: dropped.column,
    },
  ];
}

export function compile(source: string): CompileResult {
  if (source.length > MAX_SOURCE_CHARS) {
    return failedResult(source, {
      phase: "Limit",
      message: `Source is too large: ${source.length.toLocaleString("en-US")} characters (the limit is ${MAX_SOURCE_CHARS.toLocaleString("en-US")})`,
      line: 1,
      column: 1,
    });
  }
  try {
    return compileSource(source);
  } catch (e) {
    // The parser limits its own depth, so this safety net should not fire. If it does, the
    // person gets a message instead of a blank screen.
    const stackOverflow = e instanceof RangeError && /call stack/i.test(e.message);
    return failedResult(
      source,
      stackOverflow
        ? {
            phase: "Limit",
            message: "This program is too large or too deeply nested for the compiler to process",
            line: 1,
            column: 1,
          }
        : {
            phase: "Internal",
            message: `Unexpected compiler failure: ${e instanceof Error ? e.message : String(e)}. This is a bug in PiGPL.`,
            line: 1,
            column: 1,
          },
    );
  }
}

function compileSource(source: string): CompileResult {
  const log = new EventLog();
  const errors: CompilerError[] = [];
  // Loops, not push(...list): spreading a very long list into arguments can overflow the stack.
  const addErrors = (list: CompilerError[]) => {
    for (const e of list) errors.push(e);
  };

  const lexed = tokenize(source, log);
  addErrors(lexed.errors);

  const parsed = parse(lexed.tokens, log);
  addErrors(parsed.errors);

  let symbols: SymbolEntry[] = [];
  let checks: SemanticCheck[] = [];
  let ir: Quad[] = [];
  let optimizedIr: Quad[] = [];
  let optimizations: OptimizationStep[] = [];
  let execution: ExecutionResult | null = null;
  let tree: TreeNode | null = null;

  const syntaxOk = parsed.errors.length === 0 && parsed.ast !== null;
  // A program with any lexical or syntax error is not analyzed, translated or run.
  const frontEndOk = syntaxOk && lexed.errors.length === 0;

  if (parsed.ast) {
    tree = toTree(parsed.ast);
  }

  if (frontEndOk && parsed.ast) {
    const sem = analyze(parsed.ast, log);
    symbols = sem.symbols.all();
    checks = sem.checks;
    addErrors(sem.errors);

    const irGen = generateIR(parsed.ast, log);
    ir = irGen.quads;
    const opt = optimize(ir, log);
    optimizedIr = opt.quads;
    optimizations = opt.steps;

    if (sem.errors.length === 0) {
      execution = execute(optimizedIr);
      if (execution.error) errors.push(execution.error);
      for (const step of execution.steps) {
        if (step.output !== undefined) {
          log.emit("execute", "print", step.output, undefined, { text: step.text });
        }
      }
      if (execution.output.length === 0) {
        log.emit("execute", "done", "Program finished with no output");
      } else {
        log.emit("execute", "done", `Program printed ${execution.output.length} line(s)`);
      }
    }
  }

  return {
    source,
    tokens: lexed.tokens,
    ast: parsed.ast,
    tree,
    symbols,
    checks,
    ir,
    optimizedIr,
    optimizations,
    execution,
    errors: capErrors(errors),
    events: log.events,
    phasesOk: {
      lexer: lexed.errors.length === 0,
      parser: syntaxOk,
      semantic: frontEndOk && errors.every((e) => e.phase !== "Semantic"),
      ir: ir.length > 0,
      optimize: optimizedIr.length > 0,
      execute: execution !== null && !execution.error,
    },
  };
}
