import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { AssetType } from "@prisma/client";

import { audioExtract } from "@/lib/pipeline/audio-extract";
import { audioMerge } from "@/lib/pipeline/audio-merge";
import { audioTrim } from "@/lib/pipeline/audio-trim";
import {
  extractFalAssets,
  runFalImageJob,
  runFalModelStep,
  runFalStep,
  runFalVideoJob,
} from "@/lib/providers/fal";
import type { ProviderModelInfo, ProviderRunAsset } from "@/lib/providers/types";
import { storage } from "@/lib/storage";
import { persistBytesToStorage } from "@/lib/storage/persist";

const execFileAsync = promisify(execFile);

export type StepResult = { data?: unknown; asset?: ProviderRunAsset };

export type RunnerContext = {
  userId: string;
  stepId: string;
  // resolve a providerModelId to the info fal needs
  getModel: (providerModelId: string) => Promise<ProviderModelInfo>;
  // for merge: resolve an assetId to its stored bytes
  readAsset: (assetId: string) => Promise<{ data: Buffer; contentType: string }>;
};

export type StepRunner = (
  resolvedInput: Record<string, unknown>,
  providerModelId: string | undefined,
  ctx: RunnerContext,
) => Promise<StepResult>;

/**
 * Strip optional ```json / ``` fences and/or surrounding prose from an LLM
 * response, then JSON.parse. Takes the substring from the first `{` to the last
 * `}` (or first `[` to last `]`). Throws a clear error if no JSON is found or
 * parsing fails.
 */
export function extractJson(text: string): unknown {
  const objStart = text.indexOf("{");
  const arrStart = text.indexOf("[");
  let start = -1;
  let end = -1;
  // Prefer whichever bracket type appears first.
  const useObject =
    objStart !== -1 && (arrStart === -1 || objStart < arrStart);
  if (useObject) {
    start = objStart;
    end = text.lastIndexOf("}");
  } else if (arrStart !== -1) {
    start = arrStart;
    end = text.lastIndexOf("]");
  }
  if (start === -1 || end === -1 || end < start) {
    throw new Error("extractJson: no JSON object or array found in text");
  }
  const slice = text.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch (err) {
    throw new Error(`extractJson: failed to parse JSON: ${(err as Error).message}`);
  }
}

const llm: StepRunner = async (resolvedInput, providerModelId, ctx) => {
  const base = resolvedInput.prompt;
  if (typeof base !== "string") throw new Error("llm runner: resolvedInput.prompt must be a string");
  // Optional context (e.g. a runtime transcript) is appended as serialized JSON
  // so the prompt itself stays a plain string.
  const prompt =
    resolvedInput.context !== undefined
      ? `${base}\n\nCONTEXT:\n${JSON.stringify(resolvedInput.context)}`
      : base;
  // Prefer the configured ProviderModel: its metadata (fal endpoint + staticInputs,
  // e.g. the concrete fal model NAME) drives the call. `providerModelId` is OUR row id,
  // NOT a fal model name, so it must never be sent as fal's `model` param.
  let data: Record<string, unknown>;
  if (providerModelId) {
    const model = await ctx.getModel(providerModelId);
    ({ data } = await runFalModelStep(model, { prompt }));
  } else {
    // Fallback when no model is configured on the step.
    ({ data } = await runFalStep("fal-ai/any-llm", { prompt, model: "anthropic/claude-3.5-sonnet" }));
  }
  const text = (data.output ?? data.text ?? data.response) as unknown;
  if (typeof text !== "string") throw new Error("llm runner: fal response had no output/text/response text field");
  return { data: extractJson(text) };
};

const image: StepRunner = async (resolvedInput, providerModelId, ctx) => {
  if (!providerModelId) throw new Error("image runner: missing providerModelId");
  const model = await ctx.getModel(providerModelId);
  const res = await runFalImageJob({
    jobId: ctx.stepId,
    userId: ctx.userId,
    model,
    input: resolvedInput as never,
  });
  return { asset: res.assets[0] };
};

const video: StepRunner = async (resolvedInput, providerModelId, ctx) => {
  if (!providerModelId) throw new Error("video runner: missing providerModelId");
  const model = await ctx.getModel(providerModelId);
  const res = await runFalVideoJob({
    jobId: ctx.stepId,
    userId: ctx.userId,
    model,
    input: resolvedInput as never,
  });
  return { asset: res.assets[0] };
};

const merge: StepRunner = async (resolvedInput, _providerModelId, ctx) => {
  const videos = resolvedInput.videos;
  if (!Array.isArray(videos) || videos.length === 0) {
    throw new Error("merge runner: resolvedInput.videos must be a non-empty array of asset ids");
  }
  const ids = videos.map((v) => String(v));

  const dir = await mkdtemp(path.join(os.tmpdir(), "pf-merge-"));
  try {
    const inputPaths: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      const { data } = await ctx.readAsset(ids[i]);
      const p = path.join(dir, `in${i}.mp4`);
      await writeFile(p, data);
      inputPaths.push(p);
    }
    const outPath = path.join(dir, "out.mp4");

    // concat filter with re-encode (robust to differing inputs), video-only.
    const args: string[] = ["-y"];
    for (const p of inputPaths) args.push("-i", p);
    const filterInputs = inputPaths.map((_, i) => `[${i}:v]`).join("");
    const filter = `${filterInputs}concat=n=${inputPaths.length}:v=1:a=0[outv]`;
    args.push(
      "-filter_complex",
      filter,
      "-map",
      "[outv]",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      outPath,
    );

    await execFileAsync("ffmpeg", args);

    const outBuf = await readFile(outPath);
    const persisted = await persistBytesToStorage(storage, {
      kind: "asset",
      id: ctx.stepId,
      data: outBuf,
      contentType: "video/mp4",
    });
    return {
      asset: {
        type: AssetType.VIDEO,
        url: persisted.url,
        metadata: { storageKey: persisted.storageKey },
      },
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

export type SttWord = { text: string; start: number; end: number; speaker_id?: string };
export type SttResult = { text: string; words: SttWord[] };

/**
 * Normalize fal ElevenLabs STT responses into a stable {text, words[]} shape.
 * Defensive about the word array key (words | chunks | segments) and per-word
 * field names (text|word, start|start_time, end|end_time, speaker_id|speaker).
 */
export function normalizeStt(data: Record<string, unknown>): SttResult {
  const text = typeof data.text === "string" ? data.text : "";
  const raw =
    (Array.isArray(data.words) && data.words) ||
    (Array.isArray(data.chunks) && data.chunks) ||
    (Array.isArray(data.segments) && data.segments) ||
    [];
  const words: SttWord[] = (raw as Record<string, unknown>[]).map((w) => ({
    text: (w.text ?? w.word ?? "") as string,
    start: Number(w.start ?? w.start_time ?? 0),
    end: Number(w.end ?? w.end_time ?? 0),
    speaker_id: (w.speaker_id ?? w.speaker) as string | undefined,
  }));
  return { text, words };
}

/** Pull a voice id out of a voice-clone response; throws if none present. */
export function extractVoiceId(data: Record<string, unknown>): string {
  const id = data.voice_id ?? data.custom_voice_id ?? data.id;
  if (typeof id !== "string" || !id) {
    throw new Error("extractVoiceId: response had no voice_id/custom_voice_id/id");
  }
  return id;
}

const stt: StepRunner = async (resolvedInput, providerModelId, ctx) => {
  if (!providerModelId) throw new Error("stt runner: missing providerModelId");
  const model = await ctx.getModel(providerModelId);
  const { data } = await runFalModelStep(model, resolvedInput);
  return { data: normalizeStt(data) };
};

const voiceClone: StepRunner = async (resolvedInput, providerModelId, ctx) => {
  if (!providerModelId) throw new Error("voice-clone runner: missing providerModelId");
  const model = await ctx.getModel(providerModelId);
  const { data } = await runFalModelStep(model, resolvedInput);
  return { data: { voice_id: extractVoiceId(data) } };
};

const tts: StepRunner = async (resolvedInput, providerModelId, ctx) => {
  if (!providerModelId) throw new Error("tts runner: missing providerModelId");
  const model = await ctx.getModel(providerModelId);
  const { data } = await runFalModelStep(model, resolvedInput);
  const assets = extractFalAssets(data, AssetType.AUDIO);
  if (!assets.length) throw new Error("tts runner: fal returned no audio outputs");
  return { asset: assets[0] };
};

/**
 * Build a StepRunner for the common "run a fal model, extract one asset of a
 * fixed type" shape shared by many studio steps. Differs only by AssetType.
 */
function makeAssetRunner(assetType: AssetType, label: string): StepRunner {
  return async (resolvedInput, providerModelId, ctx) => {
    if (!providerModelId) throw new Error(`${label} step requires a providerModelId`);
    const model = await ctx.getModel(providerModelId);
    const { data } = await runFalModelStep(model, resolvedInput as Record<string, unknown>);
    const assets = extractFalAssets(data, assetType);
    if (!assets.length) throw new Error(`${label}: fal returned no ${assetType} output`);
    return { asset: assets[0] };
  };
}

const RUNNERS: Record<string, StepRunner> = {
  llm,
  image,
  video,
  merge,
  stt,
  tts,
  "voice-clone": voiceClone,
  "audio-merge": audioMerge,
  "trim-audio": audioTrim,
  "extract-audio": audioExtract,
  music: makeAssetRunner(AssetType.AUDIO, "music"),
  "image-edit": makeAssetRunner(AssetType.IMAGE, "image-edit"),
  "trim-video": makeAssetRunner(AssetType.VIDEO, "trim-video"),
  "mux-audio": makeAssetRunner(AssetType.VIDEO, "mux-audio"),
  "auto-subtitle": makeAssetRunner(AssetType.VIDEO, "auto-subtitle"),
  lipsync: makeAssetRunner(AssetType.VIDEO, "lipsync"),
};

export function getRunner(stepType: string): StepRunner {
  const r = RUNNERS[stepType];
  if (!r) throw new Error(`No runner for step type "${stepType}"`);
  return r;
}
