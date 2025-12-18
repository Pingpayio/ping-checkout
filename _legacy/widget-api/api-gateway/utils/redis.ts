type StoredValue = { value: string; expiresAt: number | null };

const store = new Map<string, StoredValue>();

const now = () => Date.now();

function purgeExpired(key: string) {
  const entry = store.get(key);
  if (!entry) return;
  if (entry.expiresAt !== null && entry.expiresAt <= now()) {
    store.delete(key);
  }
}

async function get(key: string): Promise<string | null> {
  purgeExpired(key);
  return store.get(key)?.value ?? null;
}

async function setex(key: string, ttlSeconds: number, value: string): Promise<void> {
  const expiresAt = now() + ttlSeconds * 1000;
  store.set(key, { value, expiresAt });
}

async function incr(key: string): Promise<number> {
  purgeExpired(key);
  const current = Number(store.get(key)?.value ?? '0');
  const next = current + 1;
  store.set(key, { value: String(next), expiresAt: store.get(key)?.expiresAt ?? null });
  return next;
}

async function expire(key: string, ttlSeconds: number): Promise<void> {
  const entry = store.get(key);
  if (!entry) return;
  entry.expiresAt = now() + ttlSeconds * 1000;
  store.set(key, entry);
}

async function pttl(key: string): Promise<number> {
  purgeExpired(key);
  const entry = store.get(key);
  if (!entry) return -2;
  if (entry.expiresAt === null) return -1;
  return entry.expiresAt - now();
}

function clear(): void {
  store.clear();
}

export const redisStore = {
  get,
  setex,
  incr,
  expire,
  pttl,
  __clear: clear
};



