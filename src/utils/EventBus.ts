export type EventHandler<T = unknown> = (payload: T) => void;

export class EventBus<TEvents extends Record<string, unknown>> {
  private listeners = new Map<keyof TEvents, Set<EventHandler<never>>>();

  on<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as EventHandler<never>);
    return () => this.off(event, handler);
  }

  off<K extends keyof TEvents>(event: K, handler: EventHandler<TEvents[K]>): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(handler as EventHandler<never>);
    if (set.size === 0) {
      this.listeners.delete(event);
    }
  }

  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const handler of set) {
      (handler as EventHandler<TEvents[K]>)(payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
