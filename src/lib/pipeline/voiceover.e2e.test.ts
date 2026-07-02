import { describe, it, expect, beforeAll } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { PipelineType, PipelineStatus, StepStatus, CreditReason, AssetType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { submitPipeline } from "./submit";
import { runPipeline } from "./executor";
import { createExecutorPort } from "./port";
import { getPipelineStatus } from "./status";
import { AUDIO_MODEL_SLUGS } from "./audio-models";

// Real end-to-end Voice-over pipeline check. This drives real fal speech-to-text,
// an LLM translation, a real fal voice-clone, per-segment fal text-to-speech, then a
// local ffmpeg timestamp merge — hitting the live fal API + real DB + local disk.
// It COSTS REAL FAL CREDITS (STT + clone + one TTS call per segment), so it is
// SKIPPED unless RUN_PIPELINE_E2E=1. Run it explicitly once you have seeded the
// audio models and stored the fal key, e.g.:
//   RUN_PIPELINE_E2E=1 \
//   PIPELINE_E2E_AUDIO_URL=https://example.com/short-clip.mp3 \
//   PIPELINE_E2E_LANG=Spanish \
//   npx vitest run src/lib/pipeline/voiceover.e2e.test.ts
//
// The source audio is REQUIRED via env — there is no safe default, and STT must be
// able to fetch a real, short clip. If unset we throw loudly in beforeAll so nothing
// runs (and no credits are spent).
const RUN = process.env.RUN_PIPELINE_E2E === "1";
const MEDIA_ROOT = process.env.MEDIA_ROOT ?? "/home/tools/pixelfoundry-media";
const TEST_EMAIL = "voiceover-e2e@example.test";

const AUDIO_URL = process.env.PIPELINE_E2E_AUDIO_URL ?? "";
const TARGET_LANGUAGE = process.env.PIPELINE_E2E_LANG ?? "Spanish";

describe.skipIf(!RUN)("Voice-over pipeline end-to-end (Phase 4)", () => {
  let userId: string;
  let audioAssetId: string;
  let sttModelId: string;
  let ttsModelId: string;
  let cloneModelId: string;

  beforeAll(async () => {
    if (!AUDIO_URL) {
      throw new Error(
        "Voice-over e2e requires a source audio clip: set PIPELINE_E2E_AUDIO_URL to a " +
          "short, publicly fetchable audio URL (there is no safe default).",
      );
    }

    const user = await prisma.user.upsert({
      where: { email: TEST_EMAIL },
      create: { email: TEST_EMAIL, name: "voiceover e2e", credits: 1000 },
      update: { credits: 1000 },
      select: { id: true },
    });
    userId = user.id;

    // Resolve the seeded FAL audio model rows by their canonical slugs. If any is
    // missing the run cannot proceed, so fail with an operator-friendly message
    // rather than burning credits on a partial pipeline.
    const resolveModelId = async (slug: string, label: string): Promise<string> => {
      const row = await prisma.providerModel.findFirst({
        where: { provider: "FAL", slug },
        select: { id: true },
      });
      if (!row) {
        throw new Error(
          `Voice-over e2e: no FAL ${label} model row for slug "${slug}". ` +
            "Seed the audio models (AUDIO_MODEL_SLUGS) before running.",
        );
      }
      return row.id;
    };

    sttModelId = await resolveModelId(AUDIO_MODEL_SLUGS.stt, "speech-to-text");
    ttsModelId = await resolveModelId(AUDIO_MODEL_SLUGS.tts, "text-to-speech");
    cloneModelId = await resolveModelId(AUDIO_MODEL_SLUGS.clone, "voice-clone");

    // Register the source audio as an input Asset so audioAssetId points at a real
    // row. The definition still uses params.audioUrl literally for STT/clone input,
    // so audioUrl must remain the fetchable URL.
    const asset = await prisma.asset.create({
      data: {
        userId,
        type: AssetType.AUDIO,
        title: "voiceover e2e source",
        url: AUDIO_URL,
      },
      select: { id: true },
    });
    audioAssetId = asset.id;
  });

  it(
    "runs the full flow (transcribe -> translate + clone -> per-seg tts -> timestamp merge), stores the merged audio locally, and reconciles credits",
    async () => {
      const params: Record<string, unknown> = {
        audioUrl: AUDIO_URL,
        audioAssetId,
        targetLanguage: TARGET_LANGUAGE,
        sttModelId,
        ttsModelId,
        cloneModelId,
      };

      // Submit inline. Pass a no-op enqueue so submitPipeline does not hand the
      // pipeline off to the BullMQ worker — this test drives runPipeline directly.
      const { pipelineId, heldCost } = await submitPipeline(
        { userId, type: PipelineType.VOICEOVER, params },
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

      // ---- Step inventory: transcribe, translate, clone, >=1 tts, merge — all DONE. ----
      const steps = await prisma.pipelineStep.findMany({
        where: { pipelineId },
        select: { key: true, status: true, output: true, outputAssetId: true },
      });
      const byKey = (k: string) => steps.find((s) => s.key === k);

      const transcribe = byKey("transcribe");
      expect(transcribe?.status).toBe(StepStatus.DONE);
      const transcribeOut = transcribe!.output as { words?: unknown[] } | null;
      expect(Array.isArray(transcribeOut?.words)).toBe(true);
      expect(transcribeOut!.words!.length).toBeGreaterThan(0);

      const translate = byKey("translate");
      expect(translate?.status).toBe(StepStatus.DONE);
      const translateOut = translate!.output as
        | { segments?: unknown[]; totalMs?: number }
        | null;
      expect(Array.isArray(translateOut?.segments)).toBe(true);
      expect(translateOut!.segments!.length).toBeGreaterThan(0);
      const totalMs = Number(translateOut!.totalMs);
      expect(Number.isFinite(totalMs)).toBe(true);
      expect(totalMs).toBeGreaterThan(0);

      const clone = byKey("clone");
      expect(clone?.status).toBe(StepStatus.DONE);

      const ttsSteps = steps.filter((s) => /^seg:\d+:tts$/.test(s.key));
      expect(ttsSteps.length).toBeGreaterThanOrEqual(1);
      expect(ttsSteps.every((s) => s.status === StepStatus.DONE)).toBe(true);

      const merge = byKey("merge");
      expect(merge?.status).toBe(StepStatus.DONE);
      expect(merge!.outputAssetId).toBeTruthy();

      // ---- Terminal output asset is the merged AUDIO, stored on local disk. ----
      const pipeline = await prisma.pipeline.findUniqueOrThrow({
        where: { id: pipelineId },
        select: { outputAssetId: true, actualCost: true, heldCost: true },
      });
      expect(pipeline.outputAssetId).toBe(merge!.outputAssetId);

      const asset = await prisma.asset.findUniqueOrThrow({
        where: { id: pipeline.outputAssetId! },
        select: { type: true, url: true, storageKey: true, sizeBytes: true },
      });
      expect(asset.type).toBe(AssetType.AUDIO);
      expect(asset.url.startsWith("/media/")).toBe(true);
      expect(asset.storageKey).toBeTruthy();

      const abs = path.join(MEDIA_ROOT, asset.storageKey!);
      const stat = await fs.stat(abs);
      expect(stat.size).toBeGreaterThan(0);
      if (asset.sizeBytes != null) {
        expect(stat.size).toBe(asset.sizeBytes);
      }

      // ---- The spike assertion: the merged audio has a real, sane duration. ----
      // The merge lays each translated segment onto a silent bed of exactly totalMs,
      // so the output duration should be ~totalMs. Allow a few seconds of slack for
      // codec padding / the trailing segment overrunning the bed.
      const durationOut = execFileSync("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=nw=1:nk=1",
        abs,
      ])
        .toString()
        .trim();
      const durationSec = Number(durationOut);
      expect(Number.isFinite(durationSec)).toBe(true);
      expect(durationSec).toBeGreaterThan(0);
      // Within ~5s of the transcript's total length in either direction.
      const totalSec = totalMs / 1000;
      expect(Math.abs(durationSec - totalSec)).toBeLessThanOrEqual(5);

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

      // Re-invoke runPipeline: the terminal-status guard should short-circuit
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
