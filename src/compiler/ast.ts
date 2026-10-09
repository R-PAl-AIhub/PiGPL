import type { SourceLoc } from "./types.ts";

export type NodeKind =
  | "program"
  | "declaration"
  | "assignment"
  | "index-assign"
  | "print"
  | "if"
  | "while"
  | "for"
  | "fn"
  | "return"
  | "expr-stmt"
  | "binary"
  | "unary"
  | "identifier"
  | "literal"
  | "call"
  | "list"
  | "index"
  | "block";

export interface ASTBase {
  id: number;
  kind: NodeKind;
  loc: SourceLoc;
  eventId: number;
  resolvedType?: string;
}

export interface Program extends ASTBase {
  kind: "program";
  statements: Stmt[];
}

export interface Declaration extends ASTBase {
  kind: "declaration";
  name: string;
  varType: string;
  value: Expr;
}

export interface Assignment extends ASTBase {
  kind: "assignment";
  name: string;
  value: Expr;
}

export interface IndexAssign extends ASTBase {
  kind: "index-assign";
  target: Expr;
  index: Expr;
  value: Expr;
}

export interface PrintStmt extends ASTBase {
  kind: "print";
  expression: Expr;
}

export interface IfStmt extends ASTBase {
  kind: "if";
  condition: Expr;
  thenBlock: Stmt[];
  elifs: { condition: Expr; block: Stmt[] }[];
  elseBlock: Stmt[] | null;
}

export interface WhileStmt extends ASTBase {
  kind: "while";
  condition: Expr;
  body: Stmt[];
}

export interface ForStmt extends ASTBase {
  kind: "for";
  iterator: string;
  iterable: Expr;
  body: Stmt[];
}

export interface Param {
  name: string;
  type: string;
  loc: SourceLoc;
}

export interface FnStmt extends ASTBase {
  kind: "fn";
  name: string;
  params: Param[];
  returnType: string;
  body: Stmt[];
}

export interface ReturnStmt extends ASTBase {
  kind: "return";
  value: Expr | null;
}

export interface ExprStmt extends ASTBase {
  kind: "expr-stmt";
  expression: Expr;
}

export type Stmt =
  | Declaration
  | Assignment
  | IndexAssign
  | PrintStmt
  | IfStmt
  | WhileStmt
  | ForStmt
  | FnStmt
  | ReturnStmt
  | ExprStmt;

export interface BinaryOp extends ASTBase {
  kind: "binary";
  operator: string;
  left: Expr;
  right: Expr;
}

export interface UnaryOp extends ASTBase {
  kind: "unary";
  operator: string;
  operand: Expr;
}

export interface Identifier extends ASTBase {
  kind: "identifier";
  name: string;
}

export interface Literal extends ASTBase {
  kind: "literal";
  value: number | string | boolean;
  literalType: "int" | "float" | "string" | "bool";
}

export interface CallExpr extends ASTBase {
  kind: "call";
  callee: Expr;
  args: Expr[];
}

export interface ListLiteral extends ASTBase {
  kind: "list";
  elements: Expr[];
}

export interface IndexExpr extends ASTBase {
  kind: "index";
  target: Expr;
  index: Expr;
}

export type Expr = BinaryOp | UnaryOp | Identifier | Literal | CallExpr | ListLiteral | IndexExpr;

export type ASTNode = Program | Stmt | Expr;

export interface TreeNode {
  id: number;
  kind: string;
  label: string;
  loc: SourceLoc;
  eventId: number;
  children: TreeNode[];
}

let nextAstId = 1;

export function resetAstIds() {
  nextAstId = 1;
}

export function newAstId() {
  return nextAstId++;
}

export function locOf(
  line = 0,
  column = 0,
  start = 0,
  end = 0,
): SourceLoc {
  return { line, column, start, end };
}

export function nodeLabel(node: ASTNode): string {
  switch (node.kind) {
    case "program":
      return "Program";
    case "declaration":
      return `let ${node.name}: ${node.varType}`;
    case "assignment":
      return `${node.name} =`;
    case "index-assign":
      return "[] =";
    case "print":
      return "print";
    case "if":
      return "if";
    case "while":
      return "while";
    case "for":
      return `for ${node.iterator} in`;
    case "fn":
      return `fn ${node.name}`;
    case "return":
      return "return";
    case "expr-stmt":
      return "expr";
    case "binary":
      return node.operator;
    case "unary":
      return node.operator;
    case "identifier":
      return node.name;
    case "literal":
      return node.literalType === "string" ? `"${node.value}"` : String(node.value);
    case "call":
      return "call";
    case "list":
      return "list";
    case "index":
      return "index";
    default:
      return "node";
  }
}

export function childNodes(node: ASTNode): { label?: string; node: ASTNode }[] {
  switch (node.kind) {
    case "program":
      return node.statements.map((s) => ({ node: s }));
    case "declaration":
      return [{ node: node.value }];
    case "assignment":
      return [{ node: node.value }];
    case "index-assign":
      return [
        { label: "target", node: node.target },
        { label: "index", node: node.index },
        { label: "value", node: node.value },
      ];
    case "print":
      return [{ node: node.expression }];
    case "if": {
      const kids: { label?: string; node: ASTNode }[] = [
        { label: "cond", node: node.condition },
        ...node.thenBlock.map((s) => ({ label: "then", node: s })),
      ];
      for (const el of node.elifs) {
        kids.push({ label: "elif", node: el.condition });
        for (const s of el.block) kids.push({ label: "elif", node: s });
      }
      if (node.elseBlock) {
        for (const s of node.elseBlock) kids.push({ label: "else", node: s });
      }
      return kids;
    }
    case "while":
      return [{ label: "cond", node: node.condition }, ...node.body.map((s) => ({ node: s }))];
    case "for":
      return [{ label: "in", node: node.iterable }, ...node.body.map((s) => ({ node: s }))];
    case "fn":
      return node.body.map((s) => ({ node: s }));
    case "return":
      return node.value ? [{ node: node.value }] : [];
    case "expr-stmt":
      return [{ node: node.expression }];
    case "binary":
      return [{ node: node.left }, { node: node.right }];
    case "unary":
      return [{ node: node.operand }];
    case "call":
      return [{ label: "fn", node: node.callee }, ...node.args.map((a) => ({ node: a }))];
    case "list":
      return node.elements.map((e) => ({ node: e }));
    case "index":
      return [{ node: node.target }, { node: node.index }];
    default:
      return [];
  }
}

export function toTree(node: ASTNode, wrapperLabel?: string): TreeNode {
  const children = childNodes(node).map((c) => toTree(c.node, c.label));
  const base = nodeLabel(node);
  return {
    id: node.id,
    kind: node.kind,
    label: wrapperLabel ? `${wrapperLabel}: ${base}` : base,
    loc: node.loc,
    eventId: node.eventId,
    children,
  };
}

export function flattenTree(node: TreeNode): TreeNode[] {
  return [node, ...node.children.flatMap(flattenTree)];
}
