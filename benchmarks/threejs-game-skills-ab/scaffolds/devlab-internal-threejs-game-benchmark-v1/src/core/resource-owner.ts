export type Cleanup = () => void | Promise<void>;

/** LIFO, idempotent ownership for listeners, GPU resources, and renderer state. */
export class ResourceOwner {
  private readonly cleanups: Cleanup[] = [];
  private closed = false;

  defer(cleanup: Cleanup): void {
    if (this.closed) {
      throw new Error("cannot register a resource after shutdown");
    }
    this.cleanups.push(cleanup);
  }

  own<T extends { dispose(): void | Promise<void> }>(resource: T): T {
    this.defer(() => resource.dispose());
    return resource;
  }

  async shutdown(): Promise<void> {
    if (this.closed) return;
    this.closed = true;

    const failures: unknown[] = [];
    while (this.cleanups.length > 0) {
      const cleanup = this.cleanups.pop();
      if (!cleanup) continue;
      try {
        await cleanup();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, "one or more resources failed to shut down");
    }
  }
}
