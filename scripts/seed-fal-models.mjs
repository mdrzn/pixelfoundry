// Targeted upsert of fal.ai provider models. Safe: only touches FAL rows,
// never the admin-managed catalog. (The legacy scripts/seed-provider-models.mjs
// is stale — uses the removed `jobType` field and its `update` clobbers metadata —
// do NOT run it; see the "retire legacy seed" follow-up.)
import { PrismaClient, Provider, JobType } from "@prisma/client";

const prisma = new PrismaClient();

const FAL_MODELS = [
  {
    slug: "fal-ai/flux/schnell",
    displayName: "FLUX schnell (fal)",
    description: "Fast fal.ai text-to-image. Phase 1 smoke-test model.",
    jobTypes: [JobType.CREATE_IMAGE],
    creditCost: 6,
    metadata: {
      fal: {
        falEndpoint: "fal-ai/flux/schnell",
        inputMap: { prompt: "prompt" },
        staticInputs: { num_images: 1 },
      },
    },
  },
];

async function main() {
  for (const m of FAL_MODELS) {
    await prisma.providerModel.upsert({
      where: { provider_slug: { provider: Provider.FAL, slug: m.slug } },
      create: {
        provider: Provider.FAL,
        slug: m.slug,
        displayName: m.displayName,
        description: m.description,
        jobTypes: m.jobTypes,
        creditCost: m.creditCost,
        metadata: m.metadata,
      },
      update: {
        displayName: m.displayName,
        description: m.description,
        jobTypes: m.jobTypes,
        creditCost: m.creditCost,
        metadata: m.metadata,
        isActive: true,
      },
    });
    console.log(`Upserted FAL model ${m.slug}`);
  }
  console.log(`Done: ${FAL_MODELS.length} fal model(s).`);
}

main()
  .catch((error) => {
    console.error("Failed to seed fal models:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
