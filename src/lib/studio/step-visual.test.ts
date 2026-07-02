import { describe, expect, it } from "vitest";

import { pipelineHeadline, stepVisual } from "./step-visual";

describe("stepVisual", () => {
  it("maps DONE to done/Done", () => {
    expect(stepVisual("DONE")).toEqual({ label: "Done", tone: "done" });
  });

  it("maps RUNNING to running/Running", () => {
    expect(stepVisual("RUNNING")).toEqual({ label: "Running", tone: "running" });
  });

  it("maps FAILED to failed/Failed", () => {
    expect(stepVisual("FAILED")).toEqual({ label: "Failed", tone: "failed" });
  });

  it("maps SKIPPED to skipped/Skipped", () => {
    expect(stepVisual("SKIPPED")).toEqual({ label: "Skipped", tone: "skipped" });
  });

  it("maps PENDING to pending/Queued", () => {
    expect(stepVisual("PENDING")).toEqual({ label: "Queued", tone: "pending" });
  });

  it("maps unknown values to pending/Queued", () => {
    expect(stepVisual("WHATEVER")).toEqual({ label: "Queued", tone: "pending" });
    expect(stepVisual("")).toEqual({ label: "Queued", tone: "pending" });
  });
});

describe("pipelineHeadline", () => {
  it("returns Completed for COMPLETED", () => {
    expect(pipelineHeadline("COMPLETED", 100)).toBe("Completed");
  });

  it("returns Failed for FAILED", () => {
    expect(pipelineHeadline("FAILED", 40)).toBe("Failed");
  });

  it("returns Partially completed for PARTIAL", () => {
    expect(pipelineHeadline("PARTIAL", 60)).toBe("Partially completed");
  });

  it("returns Canceled for CANCELED", () => {
    expect(pipelineHeadline("CANCELED", 10)).toBe("Canceled");
  });

  it("returns Running with percentage for RUNNING", () => {
    expect(pipelineHeadline("RUNNING", 42)).toBe("Running… 42%");
    expect(pipelineHeadline("RUNNING", 0)).toBe("Running… 0%");
  });

  it("returns Queued for QUEUED", () => {
    expect(pipelineHeadline("QUEUED", 0)).toBe("Queued");
  });

  it("returns Queued for unknown status", () => {
    expect(pipelineHeadline("MYSTERY", 5)).toBe("Queued");
  });
});
