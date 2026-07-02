import { describe, it, expect } from "vitest";
import { AssetType } from "@prisma/client";

import { classifyUpload } from "./classify";

describe("classifyUpload", () => {
  it("classifies png as an image with the 6MB cap", () => {
    expect(classifyUpload("image/png")).toEqual({
      kind: "image",
      assetType: AssetType.IMAGE,
      maxBytes: 6 * 1024 * 1024,
    });
  });

  it("classifies audio/mpeg as audio with the 25MB cap", () => {
    expect(classifyUpload("audio/mpeg")).toEqual({
      kind: "audio",
      assetType: AssetType.AUDIO,
      maxBytes: 25 * 1024 * 1024,
    });
  });

  it("classifies the other allowed audio types as audio", () => {
    for (const mime of ["audio/wav", "audio/x-wav", "audio/mp4", "audio/webm"]) {
      expect(classifyUpload(mime)?.kind).toBe("audio");
      expect(classifyUpload(mime)?.assetType).toBe(AssetType.AUDIO);
    }
  });

  it("tolerates a charset parameter and casing", () => {
    expect(classifyUpload("IMAGE/PNG; charset=binary")?.kind).toBe("image");
  });

  it("returns null for a disallowed type", () => {
    expect(classifyUpload("application/pdf")).toBeNull();
  });
});
