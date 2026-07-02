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

/** Build ffmpeg args that strip the video stream and re-encode the audio track
 * of inFile to mp3, producing an audio-only file at outFile. */
export function buildAudioExtractArgs(inFile: string, outFile: string): string[] {
  return ["-y", "-i", inFile, "-vn", "-acodec", "libmp3lame", outFile];
}

type AudioExtractInput = {
  // The uploaded source video's asset id (a plain param, resolved to a string).
  videoAssetId?: string;
  assetId?: string;
};

/** Runner: read a source VIDEO asset and extract its audio track via ffmpeg,
 * persisting the result as a new AUDIO asset. Accepts either `videoAssetId`
 * (submit-action shape) or `assetId`. */
export const audioExtract = async (
  resolvedInput: Record<string, unknown>,
  _providerModelId: string | undefined,
  ctx: RunnerContext,
): Promise<StepResult> => {
  const input = resolvedInput as unknown as AudioExtractInput;
  const assetId = String(input.videoAssetId ?? input.assetId ?? "");
  if (!assetId) {
    throw new Error("extract-audio runner: resolvedInput.videoAssetId is required");
  }

  const dir = await mkdtemp(path.join(os.tmpdir(), "pf-audio-extract-"));
  try {
    const { data } = await ctx.readAsset(assetId);
    const inFile = path.join(dir, "in.mp4");
    await writeFile(inFile, data);

    const out = path.join(dir, "audio.mp3");
    const args = buildAudioExtractArgs(inFile, out);
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
