import type { SymbolEntry } from "./types.ts";

export class SymbolTable {
  private entries: SymbolEntry[] = [];
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
    return full;
  }

  lookup(name: string): SymbolEntry | undefined {
    const current = this.currentScope();
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i]!;
      if (e.name === name && e.scope === current) return e;
    }
    for (let i = this.scopeStack.length - 1; i >= 0; i--) {
      const scope = this.scopeStack[i]!;
      for (let j = this.entries.length - 1; j >= 0; j--) {
        const e = this.entries[j]!;
        if (e.name === name && e.scope === scope) return e;
      }
    }
    return undefined;
  }

  lookupInCurrent(name: string): SymbolEntry | undefined {
    const current = this.currentScope();
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i]!;
      if (e.name === name && e.scope === current) return e;
    }
    return undefined;
  }

  updateValue(name: string, value: unknown) {
    const entry = this.lookup(name);
    if (entry) entry.value = value;
  }

  all(): SymbolEntry[] {
    return [...this.entries];
  }
}
