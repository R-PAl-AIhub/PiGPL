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

export function compile(source: string): CompileResult {
  const log = new EventLog();
  const errors: CompilerError[] = [];

  const lexed = tokenize(source, log);
  errors.push(...lexed.errors);

  const parsed = parse(lexed.tokens, log);
  errors.push(...parsed.errors);

  let symbols: SymbolEntry[] = [];
  let checks: SemanticCheck[] = [];
  let ir: Quad[] = [];
  let optimizedIr: Quad[] = [];
  let optimizations: OptimizationStep[] = [];
  let execution: ExecutionResult | null = null;
  let tree: TreeNode | null = null;

  const syntaxOk = parsed.errors.length === 0 && parsed.ast !== null;

  if (parsed.ast) {
    tree = toTree(parsed.ast);
  }

  if (syntaxOk && parsed.ast) {
    const sem = analyze(parsed.ast, log);
    symbols = sem.symbols.all();
    checks = sem.checks;
    errors.push(...sem.errors);

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
    errors,
    events: log.events,
    phasesOk: {
      lexer: lexed.errors.length === 0,
      parser: syntaxOk,
      semantic: syntaxOk && errors.every((e) => e.phase !== "Semantic"),
      ir: ir.length > 0,
      optimize: optimizedIr.length > 0,
      execute: execution !== null && !execution.error,
    },
  };
}
