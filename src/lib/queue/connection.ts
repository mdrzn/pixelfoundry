import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

/** Shared ioredis connection for BullMQ. `maxRetriesPerRequest: null` is
 * required by BullMQ for blocking commands. */
export const redisConnection = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

/** The single queue name for pipeline runs. */
export const PIPELINE_QUEUE = "pipeline";
