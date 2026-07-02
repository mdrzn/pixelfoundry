import { Worker } from "bullmq";

import { runPipeline } from "@/lib/pipeline/executor";
import { createExecutorPort } from "@/lib/pipeline/port";
import { prisma } from "@/lib/prisma";
import { redisConnection, PIPELINE_QUEUE } from "@/lib/queue/connection";

const concurrency = Number(process.env.PIPELINE_WORKER_CONCURRENCY ?? "2");

const worker = new Worker(
  PIPELINE_QUEUE,
  async (job) => {
    const { pipelineId } = job.data as { pipelineId: string };
    const pipeline = await prisma.pipeline.findUniqueOrThrow({
      where: { id: pipelineId },
      select: { userId: true, params: true },
    });
    const port = await createExecutorPort({
      userId: pipeline.userId,
      params: (pipeline.params ?? {}) as Record<string, unknown>,
    });
    await runPipeline(pipelineId, port);
  },
  // bullmq bundles its own ioredis; cast bridges the nominal type gap between
  // the top-level ioredis instance and bullmq's expected connection type
  // (same reason as pipeline-queue.ts).
  { connection: redisConnection as never, concurrency },
);

worker.on("failed", (job, err) => console.error("[worker] pipeline failed", job?.data, err?.message));
worker.on("completed", (job) => console.log("[worker] pipeline done", job?.data));

const shutdown = async () => {
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

console.log("[worker] pipeline worker started, concurrency", concurrency);
