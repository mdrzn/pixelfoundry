import { describe, it, expect, beforeAll } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { createImageJob } from "@/lib/jobs";

// Real end-to-end fal.ai check. Hits the live fal API + real DB, so it is
// SKIPPED unless RUN_FAL_E2E=1. Run it explicitly after storing the fal key:
//   RUN_FAL_E2E=1 npx vitest run src/lib/providers/fal.e2e.test.ts
const RUN = process.env.RUN_FAL_E2E === "1";
const MEDIA_ROOT = process.env.MEDIA_ROOT ?? "/home/tools/pixelfoundry-media";
const TEST_EMAIL = "fal-e2e@example.test";

describe.skipIf(!RUN)("fal.ai end-to-end (Phase 1)", () => {
  let userId: string;
  let modelId: string;
  let startingCredits: number;
  let creditCost: number;

  beforeAll(async () => {
    const user = await prisma.user.upsert({
      where: { email: TEST_EMAIL },
      create: { email: TEST_EMAIL, name: "fal e2e", credits: 100 },
      update: { credits: 100 },
      select: { id: true, credits: true },
    });
    userId = user.id;
    startingCredits = user.credits;

    const model = await prisma.providerModel.findFirstOrThrow({
      where: { provider: "FAL", slug: "fal-ai/flux/schnell", isActive: true },
      select: { id: true, creditCost: true },
    });
    modelId = model.id;
    creditCost = model.creditCost;
  });

  it(
    "generates via fal, meters credits, and stores the asset locally",
    async () => {
      const result = await createImageJob({
        userId,
        prompt: "a single ripe red apple on a wooden table, studio lighting",
        providerModelId: modelId,
        aspectRatio: "1:1",
      });

      expect(result.jobId).toBeTruthy();
      // Credits deducted by exactly the model cost.
      expect(result.balanceAfter).toBe(startingCredits - creditCost);

      const job = await prisma.job.findUniqueOrThrow({
        where: { id: result.jobId },
        include: { outputAsset: true },
      });
      expect(job.status).toBe("COMPLETED");
      expect(job.provider).toBe("FAL");
      expect(job.providerJobId).toBeTruthy(); // request_id propagated

      const asset = job.outputAsset!;
      expect(asset).toBeTruthy();
      // Persisted locally, not a fal CDN URL or base64.
      expect(asset.url.startsWith("/media/")).toBe(true);
      expect(asset.storageKey).toBeTruthy();
      expect(asset.sizeBytes ?? 0).toBeGreaterThan(0);

      // The bytes actually exist on disk.
      const abs = path.join(MEDIA_ROOT, asset.storageKey!);
      const stat = await fs.stat(abs);
      expect(stat.size).toBe(asset.sizeBytes);

      // Ledger recorded the deduction against this job.
      const deduction = await prisma.creditLedger.findFirst({
        where: { jobId: result.jobId, reason: "DEDUCT" },
      });
      expect(deduction?.delta).toBe(-creditCost);
    },
    120_000, // fal generation can take a while
  );
});
