export type StepVisual = {
  label: string;
  tone: "done" | "running" | "pending" | "failed" | "skipped";
};

export function stepVisual(status: string): StepVisual {
  switch (status) {
    case "DONE":
      return { label: "Done", tone: "done" };
    case "RUNNING":
      return { label: "Running", tone: "running" };
    case "FAILED":
      return { label: "Failed", tone: "failed" };
    case "SKIPPED":
      return { label: "Skipped", tone: "skipped" };
    default:
      return { label: "Queued", tone: "pending" };
  }
}

export function pipelineHeadline(status: string, progress: number): string {
  switch (status) {
    case "COMPLETED":
      return "Completed";
    case "FAILED":
      return "Failed";
    case "PARTIAL":
      return "Partially completed";
    case "CANCELED":
      return "Canceled";
    case "RUNNING":
      return `Running… ${progress}%`;
    default:
      return "Queued";
  }
}
