import { Queue, type ConnectionOptions } from "bullmq";
import { redisConnection, PIPELINE_QUEUE } from "./connection";

// bullmq bundles its own ioredis; cast bridges the nominal type gap between
// the top-level ioredis instance and bullmq's expected connection type.
export const pipelineQueue = new Queue(PIPELINE_QUEUE, {
  connection: redisConnection as unknown as ConnectionOptions,
});

export async function enqueuePipeline(pipelineId: string): Promise<void> {
  await pipelineQueue.add(
    "run",
    { pipelineId },
    {
      jobId: pipelineId, // dedupe: one queue job per pipeline
      removeOnComplete: true,
      removeOnFail: false,
    },
  );
}
