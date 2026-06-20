import Redis from "ioredis";

type RedisGlobal = typeof globalThis & {
  __specflowRedis?: Redis;
  __specflowRedisSubscriber?: Redis;
};

const globalForRedis = globalThis as RedisGlobal;

export function cacheEnabled() {
  return process.env.CACHE_ENABLED !== "false" && Boolean(process.env.REDIS_URL);
}

function defaultTtlSeconds() {
  const value = Number(process.env.CACHE_DEFAULT_TTL_SECONDS ?? 300);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 300;
}

function createRedisClient() {
  if (!cacheEnabled()) return null;
  return new Redis(process.env.REDIS_URL as string, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (attempt) => Math.min(attempt * 50, 500)
  });
}

export function redisClient() {
  if (!cacheEnabled()) return null;
  globalForRedis.__specflowRedis ??= createRedisClient() ?? undefined;
  return globalForRedis.__specflowRedis ?? null;
}

export function redisSubscriber() {
  if (!cacheEnabled()) return null;
  globalForRedis.__specflowRedisSubscriber ??= createRedisClient() ?? undefined;
  return globalForRedis.__specflowRedisSubscriber ?? null;
}

async function withRedis<T>(operation: (client: Redis) => Promise<T>, fallback: T): Promise<T> {
  const client = redisClient();
  if (!client) return fallback;
  try {
    if (client.status === "wait") await client.connect();
    return await operation(client);
  } catch {
    return fallback;
  }
}

export async function cacheGetJson<T>(key: string): Promise<T | null> {
  return withRedis(async (client) => {
    const value = await client.get(key);
    if (!value) return null;
    return JSON.parse(value) as T;
  }, null);
}

export async function cacheSetJson(key: string, value: unknown, ttlSeconds = defaultTtlSeconds()) {
  return withRedis(async (client) => {
    await client.set(key, JSON.stringify(value), "EX", ttlSeconds);
    return true;
  }, false);
}

export async function cacheDelete(key: string) {
  return withRedis(async (client) => {
    await client.del(key);
    return true;
  }, false);
}

export async function acquireIdempotencyKey(key: string, ttlSeconds = 30) {
  return withRedis(async (client) => {
    const result = await client.set(`idempotency:${key}`, "1", "EX", ttlSeconds, "NX");
    return result === "OK";
  }, true);
}

export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  return withRedis(async (client) => {
    const redisKey = `ratelimit:${key}`;
    const count = await client.incr(redisKey);
    if (count === 1) await client.expire(redisKey, windowSeconds);
    const ttl = await client.ttl(redisKey);
    return { allowed: count <= limit, count, limit, resetSeconds: ttl > 0 ? ttl : windowSeconds };
  }, { allowed: true, count: 0, limit, resetSeconds: windowSeconds });
}

export async function publishTaskNotification(type: string) {
  return withRedis(async (client) => {
    await client.publish("async-task:notify", type);
    return true;
  }, false);
}

export async function waitForTaskNotification(timeoutMs: number) {
  const subscriber = redisSubscriber();
  if (!subscriber) {
    await new Promise((resolve) => setTimeout(resolve, timeoutMs));
    return false;
  }

  try {
    if (subscriber.status === "wait") await subscriber.connect();
    await subscriber.subscribe("async-task:notify");
    return await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        subscriber.off("message", onMessage);
        resolve(false);
      }, timeoutMs);
      const onMessage = () => {
        clearTimeout(timer);
        subscriber.off("message", onMessage);
        resolve(true);
      };
      subscriber.on("message", onMessage);
    });
  } catch {
    await new Promise((resolve) => setTimeout(resolve, timeoutMs));
    return false;
  }
}

export async function closeRedisClients() {
  const clients = [globalForRedis.__specflowRedis, globalForRedis.__specflowRedisSubscriber].filter(Boolean) as Redis[];
  await Promise.allSettled(clients.map((client) => client.quit()));
  globalForRedis.__specflowRedis = undefined;
  globalForRedis.__specflowRedisSubscriber = undefined;
}
