const queues = new Map<string, Promise<unknown>>();

/** Run writes for the same key one after another. Unlike inflight-share, each call still executes. */
export function enqueueByKey<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const current = previous.then(run, run);
  queues.set(key, current);
  return current;
}

export function resetWriteQueueForTests() {
  queues.clear();
}
