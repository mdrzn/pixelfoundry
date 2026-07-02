import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { AssetType } from "@prisma/client";

import type { ProviderRunAsset } from "@/lib/providers/types";
import { storage } from "@/lib/storage";
import { persistBytesToStorage } from "@/lib/storage/persist";

import type { RunnerContext, StepResult } from "@/lib/pipeline/runners";

const execFileAsync = promisify(execFile);

/** Build ffmpeg args to cut [startMs, startMs+durationMs) from inFile, re-encoding
 * to mp3 for a frame-accurate result. -ss before -i is fast-seek but fine here. */
export function buildAudioTrimArgs(
  inFile: string,
  startMs: number,
  durationMs: number,
  outFile: string,
): string[] {
  const startSec = (startMs / 1000).toFixed(3);
  const durSec = (durationMs / 1000).toFixed(3);
  return ["-y", "-ss", startSec, "-t", durSec, "-i", inFile, "-c:a", "libmp3lame", outFile];
}

type AudioTrimInput = {
  assetId: string;
  startMs: number;
  durationMs: number;
};

/** Runner: read a full audio asset, slice one segment out of it via ffmpeg. */
export const audioTrim = async (
  resolvedInput: Record<string, unknown>,
  _providerModelId: string | undefined,
  ctx: RunnerContext,
): Promise<StepResult> => {
  const input = resolvedInput as unknown as AudioTrimInput;
  const assetId = String(input.assetId ?? "");
  if (!assetId) throw new Error("trim-audio runner: resolvedInput.assetId is required");
  const startMs = Number(input.startMs);
  const durationMs = Number(input.durationMs);
  if (!Number.isFinite(startMs) || startMs < 0) {
    throw new Error("trim-audio runner: resolvedInput.startMs must be a non-negative number");
  }
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error("trim-audio runner: resolvedInput.durationMs must be a positive number");
  }

  const dir = await mkdtemp(path.join(os.tmpdir(), "pf-audio-trim-"));
  try {
    const { data, contentType } = await ctx.readAsset(assetId);
    const ext = contentType === "audio/wav" || contentType === "audio/x-wav" ? ".wav" : ".mp3";
    const inFile = path.join(dir, `in${ext}`);
    await writeFile(inFile, data);

    const out = path.join(dir, "trimmed.mp3");
    const args = buildAudioTrimArgs(inFile, startMs, durationMs, out);
    await execFileAsync("ffmpeg", args);

    const outBuf = await readFile(out);
    const persisted = await persistBytesToStorage(storage, {
      kind: "asset",
      id: ctx.stepId,
      data: outBuf,
      contentType: "audio/mpeg",
    });
    const asset: ProviderRunAsset = {
      type: AssetType.AUDIO,
      url: persisted.url,
      metadata: { storageKey: persisted.storageKey },
    };
    return { asset };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};
