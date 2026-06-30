import { PrismaClient, Provider, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

// Pricing data manually collected from Replicate website
const pricingData: Record<string, { unitPriceUSD: number; unitType: string; currency: string }> = {
  "google/nano-banana": { unitPriceUSD: 0.039, unitType: "output image", currency: "USD" },
  "flux-kontext-apps/change-haircut": { unitPriceUSD: 0.04, unitType: "output image", currency: "USD" },
  "flux-kontext-apps/cartoonify": { unitPriceUSD: 0.04, unitType: "output image", currency: "USD" },
  "flux-kontext-apps/restore-image": { unitPriceUSD: 0.04, unitType: "output image", currency: "USD" },
  "flux-kontext-apps/professional-headshot": { unitPriceUSD: 0.04, unitType: "output image", currency: "USD" },
  "flux-kontext-apps/iconic-locations": { unitPriceUSD: 0.04, unitType: "output image", currency: "USD" },
  "flux-kontext-apps/impossible-scenarios": { unitPriceUSD: 0.04, unitType: "output image", currency: "USD" },
  "xai/grok-2-image": { unitPriceUSD: 0.07, unitType: "output image", currency: "USD" },
  "tencent/hunyuan-image-3": { unitPriceUSD: 0.08, unitType: "output image", currency: "USD" },
  "openai/sora-2": { unitPriceUSD: 0.015, unitType: "run (estimated p50)", currency: "USD" },
  "openai/sora-2-pro": { unitPriceUSD: 0.043, unitType: "run (estimated p50)", currency: "USD" },
};

async function populatePricing() {
  const models = await prisma.providerModel.findMany({
    where: {
      provider: Provider.REPLICATE,
    },
    select: {
      id: true,
      slug: true,
      displayName: true,
      creditCost: true,
      metadata: true,
    },
  });

  console.log(`Found ${models.length} Replicate models\n`);

  let updated = 0;
  let skipped = 0;

  for (const model of models) {
    const pricing = pricingData[model.slug];

    if (!pricing) {
      console.log(`${model.slug}: No pricing data available, skipping`);
      skipped++;
      continue;
    }

    const existingMetadata =
      model.metadata && typeof model.metadata === "object"
        ? (model.metadata as Record<string, unknown>)
        : {};

    const updatedMetadata = {
      ...existingMetadata,
      pricing,
    };

    await prisma.providerModel.update({
      where: { id: model.id },
      data: {
        metadata: updatedMetadata as Prisma.InputJsonValue,
      },
    });

    const margin = model.creditCost * 0.01 - pricing.unitPriceUSD;
    const marginPercent = pricing.unitPriceUSD > 0
      ? ((margin / pricing.unitPriceUSD) * 100).toFixed(1)
      : "N/A";

    console.log(`✓ ${model.slug}`);
    console.log(`  Real Cost: $${pricing.unitPriceUSD.toFixed(4)} per ${pricing.unitType}`);
    console.log(`  Credit Cost: ${model.creditCost} credits ($${(model.creditCost * 0.01).toFixed(2)})`);
    console.log(`  Margin: $${margin.toFixed(4)} (${marginPercent}%)\n`);

    updated++;
  }

  console.log(`=== Summary ===`);
  console.log(`Total models: ${models.length}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
}

populatePricing()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
