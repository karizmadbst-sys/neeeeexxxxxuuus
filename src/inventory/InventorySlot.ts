import type { InventoryEntry, InventorySlotKind } from './IInventorySystem';

export class InventorySlot {
  readonly kind: InventorySlotKind;
  readonly label: string;

  private entry: InventoryEntry | null = null;

  constructor(kind: InventorySlotKind, label: string) {
    this.kind = kind;
    this.label = label;
  }

  isEmpty(): boolean {
    return this.entry === null || this.entry.quantity <= 0;
  }

  getEntry(): InventoryEntry | null {
    return this.entry;
  }

  setEntry(entry: InventoryEntry | null): InventoryEntry | null {
    const previous = this.entry;
    this.entry = entry ? { ...entry } : null;
    return previous;
  }

  addQuantity(amount: number): number {
    if (!this.entry || amount <= 0) return 0;
    const max = this.entry.definition.maxStack;
    const added = Math.min(amount, Math.max(0, max - this.entry.quantity));
    this.entry.quantity += added;
    return added;
  }

  consumeQuantity(amount = 1): boolean {
    if (!this.entry || amount <= 0 || this.entry.quantity < amount) {
      return false;
    }
    this.entry.quantity -= amount;
    if (this.entry.quantity <= 0) {
      this.entry = null;
    }
    return true;
  }

  clear(): InventoryEntry | null {
    const prev = this.entry;
    this.entry = null;
    return prev;
  }
}
