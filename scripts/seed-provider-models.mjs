import { PrismaClient, Provider, JobType } from "@prisma/client";

const prisma = new PrismaClient();

const defaults = [
  {
    provider: Provider.REPLICATE,
    jobType: JobType.CREATE_IMAGE,
    slug: "stability-ai/sdxl",
    displayName: "SDXL 1.0",
    creditCost: 15,
    metadata: {
      recommendedAspectRatio: "1:1",
    },
  },
  {
    provider: Provider.REPLICATE,
    jobType: JobType.CREATE_IMAGE,
    slug: "black-forest-labs/flux-1.1",
    displayName: "FLUX 1.1",
    creditCost: 22,
    metadata: {
      recommendedAspectRatio: "16:9",
    },
  },
  {
    provider: Provider.OPENAI,
    jobType: JobType.CREATE_IMAGE,
    slug: "dall-e-3",
    displayName: "DALL·E 3",
    creditCost: 30,
  },
  {
    provider: Provider.GEMINI,
    jobType: JobType.CREATE_IMAGE,
    slug: "models/gemini-2.0-flash-exp",
    displayName: "Gemini 2.0 Flash",
    creditCost: 18,
    metadata: {
      endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent",
    },
  },
  {
    provider: Provider.REPLICATE,
    jobType: JobType.CREATE_VIDEO,
    slug: "luma/dream-machine",
    displayName: "Dream Machine",
    creditCost: 60,
    metadata: {
      maxDurationSeconds: 10,
    },
  },
];

async function main() {
  for (const model of defaults) {
    await prisma.providerModel.upsert({
      where: {
        provider_slug: {
          provider: model.provider,
          slug: model.slug,
        },
      },
      create: {
        provider: model.provider,
        jobType: model.jobType,
        slug: model.slug,
        displayName: model.displayName,
        creditCost: model.creditCost,
        metadata: model.metadata ?? undefined,
      },
      update: {
        displayName: model.displayName,
        creditCost: model.creditCost,
        metadata: model.metadata ?? undefined,
        isActive: true,
      },
    });
  }

  console.log(`Seeded ${defaults.length} provider models.`);
}

main()
  .catch((error) => {
    console.error("Failed to seed provider models:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
