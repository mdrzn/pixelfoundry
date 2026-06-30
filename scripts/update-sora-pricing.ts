import { PrismaClient, Provider, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

// Correct Sora pricing based on OpenAI documentation
// Source: https://replicate.com/openai/sora-2 and sora-2-pro
const soraPricingData = {
  "openai/sora-2": {
    pricing: {
      model: "per-second" as const,
      tiers: [
        {
          resolution: "720p",
          unitPriceUSD: 0.10,
          unitType: "second",
          aspectRatios: ["portrait", "landscape"],
        },
      ],
      currency: "USD",
    },
    capabilities: {
      durations: [4, 8, 12],
      resolutions: ["720p"],
      aspectRatios: ["portrait", "landscape"],
      maxDuration: 20,
    },
  },
  "openai/sora-2-pro": {
    pricing: {
      model: "per-second" as const,
      tiers: [
        {
          resolution: "720p",
          unitPriceUSD: 0.30,
          unitType: "second",
          aspectRatios: ["portrait", "landscape"],
        },
        {
          resolution: "1024p",
          unitPriceUSD: 0.50,
          unitType: "second",
          aspectRatios: ["portrait", "landscape"],
        },
      ],
      currency: "USD",
    },
    capabilities: {
      durations: [4, 8, 12],
      resolutions: ["720p", "1024p"],
      aspectRatios: ["portrait", "landscape"],
      maxDuration: 20,
    },
  },
};

async function updateSoraPricing() {
  console.log("Updating Sora pricing to correct per-second tiered pricing...\n");

  for (const [slug, metadata] of Object.entries(soraPricingData)) {
    const model = await prisma.providerModel.findFirst({
      where: {
        slug,
        provider: Provider.REPLICATE,
      },
    });

    if (!model) {
      console.log(`⊘ Model ${slug} not found in database, skipping`);
      continue;
    }

    const existingMetadata =
      model.metadata && typeof model.metadata === "object"
        ? (model.metadata as Record<string, unknown>)
        : {};

    const updatedMetadata = {
      ...existingMetadata,
      ...metadata,
    };

    await prisma.providerModel.update({
      where: { id: model.id },
      data: {
        metadata: updatedMetadata as Prisma.InputJsonValue,
      },
    });

    console.log(`✓ Updated ${slug}`);
    console.log(`  Pricing model: ${metadata.pricing.model}`);
    console.log(`  Tiers:`);
    metadata.pricing.tiers.forEach((tier) => {
      console.log(
        `    - ${tier.resolution}: $${tier.unitPriceUSD.toFixed(2)}/${tier.unitType}`
      );
    });
    console.log(`  Durations: ${metadata.capabilities.durations.join(", ")} seconds`);
    console.log(`  Resolutions: ${metadata.capabilities.resolutions.join(", ")}`);
    console.log(
      `  Aspect ratios: ${metadata.capabilities.aspectRatios.join(", ")}\n`
    );
  }

  console.log("=== Summary ===");
  console.log("Sora pricing updated to accurate per-second tiered structure");
  console.log(
    "Note: Admin should update credit costs to be 'per second' for these models"
  );
}

updateSoraPricing()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
