// Per-key async mutex, in-memory/per-process — same "acceptable at current
// single-process scale" tradeoff already documented for express-rate-limit's
// in-memory store (see ADMIN_API.md § Merchant onboarding). Used to serialize
// invite-token redemption so two concurrent requests for the same token can't
// both pass the "not yet used" check before either marks it used.
const chains = new Map<string, Promise<unknown>>();

export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prior   = chains.get(key) ?? Promise.resolve();
  const result  = prior.then(fn, fn);
  const settled = result.then(() => undefined, () => undefined);

  chains.set(key, settled);
  // Once this key's queue is empty, drop it — otherwise `chains` grows by one
  // entry per distinct key ever locked, for the lifetime of the process.
  settled.finally(() => {
    if (chains.get(key) === settled) chains.delete(key);
  });

  return result;
}
