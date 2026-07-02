import { describe, expect, it } from "vitest";

import { resolveInitialTheme } from "@/lib/theme";

describe("resolveInitialTheme", () => {
  it("returns dark when stored preference is 'dark'", () => {
    expect(resolveInitialTheme("dark", false)).toBe("dark");
  });

  it("returns light when stored preference is 'light'", () => {
    expect(resolveInitialTheme("light", true)).toBe("light");
  });

  it("falls back to system dark when nothing is stored", () => {
    expect(resolveInitialTheme(null, true)).toBe("dark");
  });

  it("falls back to system light when nothing is stored", () => {
    expect(resolveInitialTheme(null, false)).toBe("light");
  });
});
