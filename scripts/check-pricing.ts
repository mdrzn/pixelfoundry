import { PrismaClient, Provider } from "@prisma/client";

const prisma = new PrismaClient();

async function checkPricing() {
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

  console.log(`Checking ${models.length} Replicate models for pricing data...\n`);

  for (const model of models) {
    const metadata =
      model.metadata && typeof model.metadata === "object"
        ? (model.metadata as Record<string, unknown>)
        : null;

    const pricing =
      metadata?.pricing && typeof metadata.pricing === "object"
        ? (metadata.pricing as Record<string, unknown>)
        : null;

    const unitPriceUSD = pricing?.unitPriceUSD;
    const unitType = pricing?.unitType;

    console.log(`Model: ${model.slug}`);
    console.log(`  Credit Cost: ${model.creditCost} credits`);
    console.log(`  Has pricing data: ${!!pricing}`);
    if (pricing && typeof unitPriceUSD === "number") {
      console.log(`  Real Cost: $${unitPriceUSD.toFixed(6)} per ${unitType ?? "run"}`);
      const margin = model.creditCost * 0.01 - unitPriceUSD;
      const marginPercent = unitPriceUSD > 0 ? ((margin / unitPriceUSD) * 100).toFixed(1) : "N/A";
      console.log(`  Margin: $${margin.toFixed(6)} (${marginPercent}%)`);
    }
    console.log();
  }
}

checkPricing()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
