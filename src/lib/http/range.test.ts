import { describe, it, expect } from "vitest";
import { parseRange } from "./range";

describe("parseRange", () => {
  it("returns null when no header", () => { expect(parseRange(null, 1000)).toBeNull(); });
  it("parses bytes=0-499", () => { expect(parseRange("bytes=0-499", 1000)).toEqual({ start: 0, end: 499 }); });
  it("parses open-ended bytes=500-", () => { expect(parseRange("bytes=500-", 1000)).toEqual({ start: 500, end: 999 }); });
  it("parses suffix bytes=-200", () => { expect(parseRange("bytes=-200", 1000)).toEqual({ start: 800, end: 999 }); });
  it("clamps end past EOF", () => { expect(parseRange("bytes=900-5000", 1000)).toEqual({ start: 900, end: 999 }); });
  it("returns 'invalid' for unsatisfiable start", () => { expect(parseRange("bytes=2000-3000", 1000)).toBe("invalid"); });
});
