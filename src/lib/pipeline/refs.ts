export type StepOutput = { data?: unknown; assetUrl?: string; assetId?: string };

function getPath(obj: unknown, path: string): unknown {
  const tokens = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let cur: unknown = obj;
  for (const t of tokens) {
    if (cur == null || typeof cur !== "object") {
      throw new Error(`Ref path "${path}" unresolved at segment "${t}"`);
    }
    cur = (cur as Record<string, unknown>)[t];
  }
  if (cur === undefined) throw new Error(`Ref path "${path}" resolved to undefined`);
  return cur;
}

function isRefToken(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v) && ("$data" in v || "$asset" in v || "$assetId" in v);
}

export function resolveInput(input: unknown, outputsByKey: Record<string, StepOutput>): unknown {
  if (Array.isArray(input)) return input.map((x) => resolveInput(x, outputsByKey));
  if (isRefToken(input)) {
    if ("$asset" in input) {
      const key = String(input.$asset);
      const out = outputsByKey[key];
      if (!out || out.assetUrl === undefined) throw new Error(`No asset output for step "${key}"`);
      return out.assetUrl;
    }
    if ("$assetId" in input) {
      const key = String(input.$assetId);
      const out = outputsByKey[key];
      if (!out || out.assetId === undefined) throw new Error(`No assetId output for step "${key}"`);
      return out.assetId;
    }
    const key = String(input.$data);
    const out = outputsByKey[key];
    if (!out || out.data === undefined) throw new Error(`No data output for step "${key}"`);
    const path = input.path as string | undefined;
    return path ? getPath(out.data, path) : out.data;
  }
  if (input && typeof input === "object") {
    const res: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) res[k] = resolveInput(v, outputsByKey);
    return res;
  }
  return input;
}
