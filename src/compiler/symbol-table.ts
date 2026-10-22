import type { SymbolEntry } from "./types.ts";

export class SymbolTable {
  private entries: SymbolEntry[] = [];
  // One map per scope, so a lookup costs one hash read per open scope instead of a scan
  // over every symbol declared so far.
  private byScope = new Map<string, Map<string, SymbolEntry>>();
  private scopeStack = ["global"];

  currentScope() {
    return this.scopeStack[this.scopeStack.length - 1] ?? "global";
  }

  enterScope(name: string) {
    this.scopeStack.push(name);
  }

  exitScope() {
    if (this.scopeStack.length > 1) this.scopeStack.pop();
  }

  declare(entry: Omit<SymbolEntry, "scope"> & { scope?: string }): SymbolEntry {
    const full: SymbolEntry = {
      ...entry,
      scope: entry.scope ?? this.currentScope(),
    };
    this.entries.push(full);
    let scope = this.byScope.get(full.scope);
    if (!scope) {
      scope = new Map();
      this.byScope.set(full.scope, scope);
    }
    scope.set(full.name, full);
    return full;
  }

  /** The innermost visible declaration of `name`, searching from the current scope outwards. */
  lookup(name: string): SymbolEntry | undefined {
    for (let i = this.scopeStack.length - 1; i >= 0; i--) {
      const found = this.byScope.get(this.scopeStack[i]!)?.get(name);
      if (found) return found;
    }
    return undefined;
  }

  lookupInCurrent(name: string): SymbolEntry | undefined {
    return this.byScope.get(this.currentScope())?.get(name);
  }

  updateValue(name: string, value: unknown) {
    const entry = this.lookup(name);
    if (entry) entry.value = value;
  }

  /** Every name visible from the current scope, for "did you mean" suggestions. */
  visibleNames(): string[] {
    const names = new Set<string>();
    for (const scope of this.scopeStack) {
      for (const name of this.byScope.get(scope)?.keys() ?? []) names.add(name);
    }
    return [...names];
  }

  all(): SymbolEntry[] {
    return [...this.entries];
  }
}
