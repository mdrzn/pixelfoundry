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

export type MergeSegment = { startMs: number; file: string };

/** Build ffmpeg args that lay each segment onto a silent stereo bed of totalMs,
 * each offset to its startMs, output = one audio file of exactly totalMs. */
export function buildAudioMergeArgs(segments: MergeSegment[], totalMs: number, outFile: string): string[] {
  const totalSec = (totalMs / 1000).toFixed(3);
  const args: string[] = ["-y", "-f", "lavfi", "-t", totalSec, "-i", "anullsrc=r=44100:cl=stereo"];
  for (const s of segments) args.push("-i", s.file);
  if (segments.length === 0) {
    // silent bed only
    args.push("-map", "0:a", "-t", totalSec, outFile);
    return args;
  }
  const delayParts = segments.map((s, i) => {
    const ms = Math.max(0, Math.round(s.startMs));
    return `[${i + 1}]adelay=${ms}|${ms}[d${i}]`;
  });
  const mixInputs = "[0]" + segments.map((_, i) => `[d${i}]`).join("");
  const filter =
    delayParts.join(";") +
    ";" +
    mixInputs +
    `amix=inputs=${segments.length + 1}:normalize=0:dropout_transition=0[out]`;
  args.push("-filter_complex", filter, "-map", "[out]", "-t", totalSec, outFile);
  return args;
}

type AudioMergeInput = {
  segments: { startMs: number; assetId: string }[];
  totalMs: number;
};

/** Runner: place N translated speech segments onto a silent bed via ffmpeg. */
export const audioMerge = async (
  resolvedInput: Record<string, unknown>,
  _providerModelId: string | undefined,
  ctx: RunnerContext,
): Promise<StepResult> => {
  const input = resolvedInput as unknown as AudioMergeInput;
  const segments = input.segments;
  if (!Array.isArray(segments)) {
    throw new Error("audio-merge runner: resolvedInput.segments must be an array");
  }
  const totalMs = Number(input.totalMs);
  if (!Number.isFinite(totalMs) || totalMs <= 0) {
    throw new Error("audio-merge runner: resolvedInput.totalMs must be a positive number");
  }

  const dir = await mkdtemp(path.join(os.tmpdir(), "pf-audio-merge-"));
  try {
    const mergeSegs: MergeSegment[] = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const { data, contentType } = await ctx.readAsset(seg.assetId);
      const ext = contentType === "audio/wav" || contentType === "audio/x-wav" ? ".wav" : ".mp3";
      const file = path.join(dir, `seg${i}${ext}`);
      await writeFile(file, data);
      mergeSegs.push({ startMs: Number(seg.startMs), file });
    }

    const out = path.join(dir, "merged.mp3");
    const args = buildAudioMergeArgs(mergeSegs, totalMs, out);
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
