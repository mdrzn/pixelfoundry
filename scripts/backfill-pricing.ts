import { PrismaClient, Provider, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

type ReplicateAPIModel = {
  latest_version?: {
    pricing?: {
      unit_price?: number | string | null;
      currency?: string | null;
      unit_type?: string | null;
    } | null;
  } | null;
};

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function fetchReplicateModelDetail(apiKey: string, slug: string) {
  const response = await fetch(`https://api.replicate.com/v1/models/${slug}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${slug}: ${response.status}`);
  }

  return (await response.json()) as ReplicateAPIModel;
}

async function backfillPricing() {
  // Fetch Replicate API credentials from database
  const credential = await prisma.providerCredential.findUnique({
    where: { provider: Provider.REPLICATE },
  });

  if (!credential?.apiKey || !credential.isActive) {
    throw new Error(
      "Replicate is not configured. Add an API key and enable it in the admin console."
    );
  }

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
  let failed = 0;

  for (const model of models) {
    console.log(`Processing ${model.slug}...`);

    try {
      // Fetch latest model data from Replicate
      const replicateData = await fetchReplicateModelDetail(
        credential.apiKey,
        model.slug
      );

      const pricing = replicateData?.latest_version?.pricing ?? null;
      const unitPrice = parseNumber(pricing?.unit_price);
      const currency = pricing?.currency ?? "USD";
      const unitType = pricing?.unit_type ?? null;

      // If no pricing available from Replicate, skip
      if (unitPrice === null) {
        console.log(`  ⊘ No pricing data available from Replicate`);
        skipped++;
        continue;
      }

      // Update model metadata
      const existingMetadata =
        model.metadata && typeof model.metadata === "object"
          ? (model.metadata as Record<string, unknown>)
          : {};

      const updatedMetadata = {
        ...existingMetadata,
        pricing: {
          unitPriceUSD: unitPrice,
          unitType,
          currency,
        },
      };

      await prisma.providerModel.update({
        where: { id: model.id },
        data: {
          metadata: updatedMetadata as Prisma.InputJsonValue,
        },
      });

      const margin = model.creditCost * 0.01 - unitPrice;
      const marginPercent = unitPrice > 0 ? ((margin / unitPrice) * 100).toFixed(1) : "N/A";

      console.log(`  ✓ Updated pricing:`);
      console.log(`    Real Cost: $${unitPrice.toFixed(6)} per ${unitType ?? "run"}`);
      console.log(`    Credit Cost: ${model.creditCost} credits ($${(model.creditCost * 0.01).toFixed(2)})`);
      console.log(`    Margin: $${margin.toFixed(6)} (${marginPercent}%)`);
      updated++;

      // Add delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      console.error(`  ✗ Failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      failed++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total models processed: ${models.length}`);
  console.log(`Successfully updated: ${updated}`);
  console.log(`Skipped (no pricing): ${skipped}`);
  console.log(`Failed: ${failed}`);
}

backfillPricing()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
