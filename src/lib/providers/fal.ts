import { AssetType, Provider } from "@prisma/client";

import { getProviderCredentialSecret } from "@/lib/admin";
import {
  ImageJobInput,
  VideoJobInput,
  ProviderJobError,
  ProviderJobOptions,
  ProviderModelInfo,
  ProviderRunAsset,
  ProviderRunResult,
} from "@/lib/providers/types";

const FAL_QUEUE = "https://queue.fal.run";
const POLL_MS = 2500;
const MAX_WAIT_MS = 8 * 60 * 1000;

type Rec = Record<string, unknown>;

export function buildFalInput(input: Rec, inputMap: Record<string, string>, staticInputs: Rec): Rec {
  const out: Rec = { ...staticInputs };
  for (const [k, target] of Object.entries(inputMap)) {
    const v = input[k];
    if (v !== undefined && v !== null && v !== "") out[target] = v;
  }
  return out;
}

export function extractFalAssets(data: Rec, type: AssetType): ProviderRunAsset[] {
  const urls: string[] = [];
  const pushUrl = (o: unknown) => {
    if (typeof o === "string") { urls.push(o); return; }
    if (o && typeof o === "object" && "url" in o && typeof (o as Rec).url === "string") urls.push((o as Rec).url as string);
  };
  if (Array.isArray((data as Rec).images)) ((data as Rec).images as unknown[]).forEach(pushUrl);
  if (Array.isArray((data as Rec).videos)) ((data as Rec).videos as unknown[]).forEach(pushUrl);
  pushUrl((data as Rec).video);
  pushUrl((data as Rec).audio);
  if (typeof (data as Rec).video_url === "string") urls.push((data as Rec).video_url as string);
  if (typeof (data as Rec).audio_url === "string") urls.push((data as Rec).audio_url as string);
  return urls.map((url) => ({ type, url, thumbnail: type === AssetType.IMAGE ? url : undefined }));
}

async function falKey(): Promise<string> {
  const cred = await getProviderCredentialSecret(Provider.FAL);
  if (!cred?.apiKey) throw new ProviderJobError("fal.ai credential not configured.");
  return cred.apiKey;
}

export async function runFalStep(endpoint: string, input: Rec): Promise<{ requestId: string; data: Rec }> {
  const key = await falKey();
  const headers = { Authorization: `Key ${key}`, "Content-Type": "application/json" };
  const submit = await fetch(`${FAL_QUEUE}/${endpoint}`, { method: "POST", headers, body: JSON.stringify(input) });
  if (!submit.ok) throw new ProviderJobError(`fal submit failed: ${await submit.text()}`);
  const submitJson = (await submit.json()) as {
    request_id?: string;
    status_url?: string;
    response_url?: string;
  };
  const request_id = submitJson.request_id;
  if (!request_id) throw new ProviderJobError("fal did not return a request_id.");

  // fal returns status_url/response_url based on the BASE app id (e.g.
  // "fal-ai/flux"), which differs from a subpath submit endpoint like
  // "fal-ai/flux/schnell". Always use the URLs fal hands back; fall back to
  // constructing them only if absent.
  const statusUrl = submitJson.status_url ?? `${FAL_QUEUE}/${endpoint}/requests/${request_id}/status`;
  const responseUrl = submitJson.response_url ?? `${FAL_QUEUE}/${endpoint}/requests/${request_id}`;

  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const st = await fetch(statusUrl, { headers });
    if (!st.ok) throw new ProviderJobError(`fal status failed: ${await st.text()}`, { providerJobId: request_id });
    const { status } = (await st.json()) as { status?: string };
    if (status === "COMPLETED") {
      const res = await fetch(responseUrl, { headers });
      if (!res.ok) throw new ProviderJobError(`fal result failed: ${await res.text()}`, { providerJobId: request_id });
      return { requestId: request_id, data: (await res.json()) as Rec };
    }
    if (status === "FAILED") throw new ProviderJobError("fal reported FAILED.", { providerJobId: request_id });
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  throw new ProviderJobError("Timed out waiting for fal.");
}

type FalModelMeta = { falEndpoint: string; inputMap?: Record<string, string>; staticInputs?: Rec };
function falMeta(model: ProviderJobOptions<unknown>["model"]): FalModelMeta {
  const m = (model.metadata ?? {}) as Rec;
  const fal = (m.fal ?? m) as Rec;
  if (typeof fal.falEndpoint !== "string") throw new ProviderJobError(`Model ${model.slug} missing fal.falEndpoint metadata.`);
  return {
    falEndpoint: fal.falEndpoint,
    inputMap: fal.inputMap as Record<string, string> | undefined,
    staticInputs: fal.staticInputs as Rec | undefined,
  };
}

/**
 * Run a model's configured fal endpoint and return the RAW response data (no
 * asset extraction), so data-returning steps (stt, voice-clone) can normalize
 * it themselves. Reuses the internal falMeta + buildFalInput helpers.
 */
export async function runFalModelStep(
  model: ProviderModelInfo,
  input: Rec,
): Promise<{ requestId: string; data: Rec }> {
  const meta = falMeta(model);
  const built = buildFalInput(input, meta.inputMap ?? {}, meta.staticInputs ?? {});
  return runFalStep(meta.falEndpoint, built);
}

export async function runFalImageJob(options: ProviderJobOptions<ImageJobInput>): Promise<ProviderRunResult> {
  const meta = falMeta(options.model);
  const input = buildFalInput(
    options.input as unknown as Rec,
    meta.inputMap ?? { prompt: "prompt", negativePrompt: "negative_prompt", aspectRatio: "aspect_ratio", width: "width", height: "height", seed: "seed" },
    meta.staticInputs ?? {},
  );
  const { requestId, data } = await runFalStep(meta.falEndpoint, input);
  const assets = extractFalAssets(data, AssetType.IMAGE);
  if (!assets.length) throw new ProviderJobError("fal returned no image outputs.");
  return { providerJobId: requestId, assets, rawResponse: data };
}

export async function runFalVideoJob(options: ProviderJobOptions<VideoJobInput>): Promise<ProviderRunResult> {
  const meta = falMeta(options.model);
  const input = buildFalInput(
    options.input as unknown as Rec,
    meta.inputMap ?? { prompt: "prompt", negativePrompt: "negative_prompt", duration: "duration", aspectRatio: "aspect_ratio" },
    meta.staticInputs ?? {},
  );
  const { requestId, data } = await runFalStep(meta.falEndpoint, input);
  const assets = extractFalAssets(data, AssetType.VIDEO);
  if (!assets.length) throw new ProviderJobError("fal returned no video outputs.");
  return { providerJobId: requestId, assets, rawResponse: data };
}
