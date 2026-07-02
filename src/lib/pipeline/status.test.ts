import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pipeline: { findUnique: (...args: unknown[]) => findUnique(...args) },
  },
}));

import { getPipelineStatus } from "./status";

beforeEach(() => {
  findUnique.mockReset();
});

describe("getPipelineStatus", () => {
  it("returns the mapped view when found and owned", async () => {
    findUnique.mockResolvedValue({
      id: "p1",
      userId: "u1",
      status: "RUNNING",
      progress: 42,
      error: null,
      steps: [
        { key: "llm", name: "Prompt", status: "SUCCEEDED" },
        { key: "img", name: "Image", status: "RUNNING" },
      ],
      outputAsset: { url: "https://cdn.example/out.png" },
    });

    const view = await getPipelineStatus("p1", "u1");

    expect(view).toEqual({
      id: "p1",
      status: "RUNNING",
      progress: 42,
      error: null,
      outputUrl: "https://cdn.example/out.png",
      steps: [
        { key: "llm", name: "Prompt", status: "SUCCEEDED" },
        { key: "img", name: "Image", status: "RUNNING" },
      ],
    });
  });

  it("maps a missing outputAsset to outputUrl null", async () => {
    findUnique.mockResolvedValue({
      id: "p1",
      userId: "u1",
      status: "QUEUED",
      progress: 0,
      error: null,
      steps: [],
      outputAsset: null,
    });

    const view = await getPipelineStatus("p1", "u1");
    expect(view?.outputUrl).toBeNull();
    expect(view?.steps).toEqual([]);
  });

  it("returns null when the pipeline is owned by another user", async () => {
    findUnique.mockResolvedValue({
      id: "p1",
      userId: "u2",
      status: "RUNNING",
      progress: 10,
      error: null,
      steps: [],
      outputAsset: null,
    });

    const view = await getPipelineStatus("p1", "u1");
    expect(view).toBeNull();
  });

  it("returns null when the pipeline is not found", async () => {
    findUnique.mockResolvedValue(null);

    const view = await getPipelineStatus("missing", "u1");
    expect(view).toBeNull();
  });
});
