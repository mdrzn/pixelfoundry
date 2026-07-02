import { describe, it, expect } from "vitest";
import { storageKeyFor } from "./index";
import { extFromContentType, contentTypeFromKey } from "./content-types";

describe("storageKeyFor", () => {
  it("shards by the first two id chars and normalizes the extension", () => {
    expect(storageKeyFor("image", "abcd1234", "png")).toBe("image/ab/abcd1234.png");
  });

  it("strips a leading dot from the extension", () => {
    expect(storageKeyFor("video", "ff00beef", ".mp4")).toBe("video/ff/ff00beef.mp4");
  });
});

describe("content-type helpers are inverses", () => {
  it("extFromContentType maps known types", () => {
    expect(extFromContentType("image/png")).toBe("png");
    expect(extFromContentType("image/jpeg; charset=binary")).toBe("jpg");
    expect(extFromContentType("IMAGE/PNG")).toBe("png");
  });

  it("extFromContentType falls back to bin", () => {
    expect(extFromContentType("application/x-unknown")).toBe("bin");
  });

  it("a key built from an ext round-trips back to its content-type", () => {
    for (const ct of ["image/png", "image/jpeg", "video/mp4", "audio/mpeg"]) {
      const ext = extFromContentType(ct);
      expect(contentTypeFromKey(`k/x.${ext}`)).toBe(ct);
    }
  });
});
