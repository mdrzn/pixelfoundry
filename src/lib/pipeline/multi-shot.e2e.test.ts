import { describe, it, expect, beforeAll } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { PipelineType, PipelineStatus, StepStatus, CreditReason } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { submitPipeline } from "./submit";
import { runPipeline } from "./executor";
import { createExecutorPort } from "./port";
import { getPipelineStatus } from "./status";

// Real end-to-end Multi-Shot pipeline check. This drives the LLM shot planner,
// fans out to real fal image generation, then real fal image-to-video generation
// per shot, then an ffmpeg merge — hitting the live fal API + real DB. It COSTS
// REAL FAL CREDITS (video generation is expensive), so it is SKIPPED unless
// RUN_PIPELINE_E2E=1. Run it explicitly once you have seeded the video model and
// stored the fal key, e.g.:
//   RUN_PIPELINE_E2E=1 \
//   PIPELINE_E2E_VIDEO_MODEL=fal-ai/<some-i2v-model> \
//   npx vitest run src/lib/pipeline/multi-shot.e2e.test.ts
//
// The image/video/llm models are configurable via env so we never hardcode a
// possibly-wrong (or unseeded) fal video model slug.
const RUN = process.env.RUN_PIPELINE_E2E === "1";
const MEDIA_ROOT = process.env.MEDIA_ROOT ?? "/home/tools/pixelfoundry-media";
const TEST_EMAIL = "pipeline-e2e@example.test";

const IMAGE_MODEL_SLUG = process.env.PIPELINE_E2E_IMAGE_MODEL ?? "fal-ai/flux/schnell";
// REQUIRED — there is no safe default for a video model (they differ in slug and
// cost, and an unseeded/wrong slug would either error mid-run or burn credits on
// the wrong model). If unset we skip loudly rather than run.
const VIDEO_MODEL_SLUG = process.env.PIPELINE_E2E_VIDEO_MODEL ?? "";
// Optional — when unset, the shots step falls back to the default any-llm model
// selected by the runner.
const LLM_MODEL_SLUG = process.env.PIPELINE_E2E_LLM_MODEL ?? "";

describe.skipIf(!RUN)("Multi-Shot pipeline end-to-end (Phase 2)", () => {
  let userId: string;
  let imageModelId: string;
  let videoModelId: string;
  let llmModelId: string | undefined;

  beforeAll(async () => {
    if (!VIDEO_MODEL_SLUG) {
      throw new Error(
        "Multi-Shot e2e requires a fal video model: set PIPELINE_E2E_VIDEO_MODEL to " +
          "a seeded FAL image-to-video model slug (there is no safe default).",
      );
    }

    const user = await prisma.user.upsert({
      where: { email: TEST_EMAIL },
      create: { email: TEST_EMAIL, name: "pipeline e2e", credits: 1000 },
      update: { credits: 1000 },
      select: { id: true },
    });
    userId = user.id;

    const imageModel = await prisma.providerModel.findFirst({
      where: { provider: "FAL", slug: IMAGE_MODEL_SLUG },
      select: { id: true },
    });
    if (!imageModel) {
      throw new Error(
        `Multi-Shot e2e: no FAL image model row for slug "${IMAGE_MODEL_SLUG}". ` +
          "Seed it (or set PIPELINE_E2E_IMAGE_MODEL) before running.",
      );
    }
    imageModelId = imageModel.id;

    const videoModel = await prisma.providerModel.findFirst({
      where: { provider: "FAL", slug: VIDEO_MODEL_SLUG },
      select: { id: true },
    });
    if (!videoModel) {
      throw new Error(
        `Multi-Shot e2e: no FAL video model row for slug "${VIDEO_MODEL_SLUG}". ` +
          "Seed a ProviderModel (provider FAL) with that slug before running.",
      );
    }
    videoModelId = videoModel.id;

    if (LLM_MODEL_SLUG) {
      const llmModel = await prisma.providerModel.findFirst({
        where: { provider: "FAL", slug: LLM_MODEL_SLUG },
        select: { id: true },
      });
      if (!llmModel) {
        throw new Error(
          `Multi-Shot e2e: PIPELINE_E2E_LLM_MODEL="${LLM_MODEL_SLUG}" set but no FAL ` +
            "model row found for it. Seed it or unset it to use the default any-llm model.",
        );
      }
      llmModelId = llmModel.id;
    } else {
      llmModelId = undefined;
    }
  });

  it(
    "runs the full fan-out (shots -> images -> videos -> merge), stores the merged output locally, and reconciles credits",
    async () => {
      const params: Record<string, unknown> = {
        story: "A tiny robot plants a seed and watches it grow into a glowing tree.",
        imageModelId,
        videoModelId,
        llmModelId,
        maxShots: 2, // bounds cost: 2 image gens + 2 video gens + 1 merge
        aspectRatio: "9:16",
      };

      // Submit inline. Pass a no-op enqueue so submitPipeline does not hand the
      // pipeline off to the BullMQ worker — this test drives runPipeline directly.
      const { pipelineId, heldCost } = await submitPipeline(
        { userId, type: PipelineType.MULTI_SHOT, params },
        { enqueue: async () => {} },
      );
      expect(pipelineId).toBeTruthy();
      expect(heldCost).toBeGreaterThan(0);

      // Execute inline against the real DB/storage/fal-backed port.
      const port = await createExecutorPort({ userId, params });
      await runPipeline(pipelineId, port);

      // ---- Pipeline reached COMPLETED. ----
      const status = await getPipelineStatus(pipelineId, userId);
      expect(status).not.toBeNull();
      expect(status!.status).toBe(PipelineStatus.COMPLETED);

      // ---- Exactly 2 image, 2 video, 1 merge — all DONE. ----
      const steps = await prisma.pipelineStep.findMany({
        where: { pipelineId },
        select: { key: true, status: true },
      });
      const imageSteps = steps.filter((s) => /^shot:\d+:image$/.test(s.key));
      const videoSteps = steps.filter((s) => /^shot:\d+:video$/.test(s.key));
      const mergeSteps = steps.filter((s) => s.key === "merge");

      expect(imageSteps).toHaveLength(2);
      expect(videoSteps).toHaveLength(2);
      expect(mergeSteps).toHaveLength(1);
      expect(imageSteps.every((s) => s.status === StepStatus.DONE)).toBe(true);
      expect(videoSteps.every((s) => s.status === StepStatus.DONE)).toBe(true);
      expect(mergeSteps.every((s) => s.status === StepStatus.DONE)).toBe(true);

      // ---- Terminal output asset is the merged video, stored on local disk. ----
      const pipeline = await prisma.pipeline.findUniqueOrThrow({
        where: { id: pipelineId },
        select: { outputAssetId: true, actualCost: true, heldCost: true },
      });
      expect(pipeline.outputAssetId).toBeTruthy();

      const asset = await prisma.asset.findUniqueOrThrow({
        where: { id: pipeline.outputAssetId! },
        select: { url: true, storageKey: true, sizeBytes: true },
      });
      expect(asset.url.startsWith("/media/")).toBe(true);
      expect(asset.storageKey).toBeTruthy();

      const abs = path.join(MEDIA_ROOT, asset.storageKey!);
      const stat = await fs.stat(abs);
      expect(stat.size).toBeGreaterThan(0);
      if (asset.sizeBytes != null) {
        expect(stat.size).toBe(asset.sizeBytes);
      }

      // ---- Credit reconciliation: actual <= held, and a REFUND row exists iff overheld. ----
      expect(pipeline.actualCost).toBeLessThanOrEqual(heldCost);

      const refunds = await prisma.creditLedger.findMany({
        where: { pipelineId, reason: CreditReason.REFUND },
      });
      if (heldCost > pipeline.actualCost) {
        expect(refunds).toHaveLength(1);
        expect(refunds[0]!.delta).toBe(heldCost - pipeline.actualCost);
      } else {
        // Nothing to refund — no REFUND row should be written.
        expect(refunds).toHaveLength(0);
      }

      // ---- FREE idempotency / resume check (no extra credits, no fal calls). ----
      // Snapshot step ids so we can assert none are created on the second run.
      const stepIdsBefore = (
        await prisma.pipelineStep.findMany({
          where: { pipelineId },
          select: { id: true },
        })
      )
        .map((s) => s.id)
        .sort();

      // Re-invoke runPipeline: the terminal-status guard (C1) should short-circuit
      // immediately, so no step runs again and no second refund is issued.
      await runPipeline(pipelineId, await createExecutorPort({ userId, params }));

      const reStatus = await getPipelineStatus(pipelineId, userId);
      expect(reStatus!.status).toBe(PipelineStatus.COMPLETED);

      const stepIdsAfter = (
        await prisma.pipelineStep.findMany({
          where: { pipelineId },
          select: { id: true },
        })
      )
        .map((s) => s.id)
        .sort();
      expect(stepIdsAfter).toEqual(stepIdsBefore);

      const refundsAfter = await prisma.creditLedger.findMany({
        where: { pipelineId, reason: CreditReason.REFUND },
      });
      // Still exactly the same number of REFUND rows as before (0 or 1) — the
      // terminal guard + idempotent refund prevent a double refund.
      expect(refundsAfter).toHaveLength(refunds.length);
    },
    300_000,
  );
});
