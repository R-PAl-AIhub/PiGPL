export type Phase =
  | "lexer"
  | "parser"
  | "ast"
  | "symbols"
  | "semantic"
  | "ir"
  | "optimize"
  | "execute";

export type StageId =
  | "source"
  | "lexer"
  | "tokens"
  | "parser"
  | "ast"
  | "symbols"
  | "semantic"
  | "ir"
  | "optimize"
  | "execute"
  | "errors"
  | "grammar";

export interface SourceLoc {
  line: number;
  column: number;
  start: number;
  end: number;
}

export interface Token {
  type: string;
  lexeme: string;
  value: string | number | boolean;
  line: number;
  column: number;
  start: number;
  end: number;
  eventId: number;
}

export interface CompilerError {
  phase: "Lexical" | "Syntax" | "Semantic" | "IR" | "Optimize" | "Runtime";
  message: string;
  line: number;
  column: number;
  start?: number;
  end?: number;
}

export interface PipelineEvent {
  id: number;
  phase: Phase;
  kind: string;
  message: string;
  loc?: SourceLoc;
  payload?: Record<string, unknown>;
}

export type PigplType = "int" | "float" | "bool" | "string" | "list" | "void" | "fn" | "unknown";

export interface SymbolEntry {
  name: string;
  varType: string;
  scope: string;
  value: unknown;
  kind: "var" | "param" | "fn" | "loop";
  eventId: number;
  line: number;
  column: number;
}

export interface SemanticCheck {
  ok: boolean;
  message: string;
  eventId: number;
  line: number;
  column: number;
}

export interface Quad {
  id: number;
  result: string | null;
  op: string;
  arg1: string | null;
  arg2: string | null;
  args?: string[];
  srcLine?: number;
  eventId: number;
  text: string;
}

export interface OptimizationStep {
  id: number;
  kind: "fold" | "propagate" | "algebraic" | "dce" | "copy";
  message: string;
  before: string;
  after: string;
  eventId: number;
}

export interface ExecStep {
  ip: number;
  text: string;
  output?: string;
}

export interface ExecutionResult {
  output: string[];
  steps: ExecStep[];
  error?: CompilerError;
  halted: boolean;
}

export const STAGES: { id: StageId; n: string; label: string; phase?: Phase }[] = [
  { id: "source", n: "0", label: "Source" },
  { id: "lexer", n: "1", label: "Lexer", phase: "lexer" },
  { id: "tokens", n: "2", label: "Tokens", phase: "lexer" },
  { id: "parser", n: "3", label: "Parser", phase: "parser" },
  { id: "ast", n: "4", label: "AST", phase: "ast" },
  { id: "symbols", n: "5", label: "Symbols", phase: "symbols" },
  { id: "semantic", n: "6", label: "Semantic", phase: "semantic" },
  { id: "ir", n: "7", label: "TAC", phase: "ir" },
  { id: "optimize", n: "8", label: "Optimize", phase: "optimize" },
  { id: "execute", n: "9", label: "Execute", phase: "execute" },
];
