import { PrismaClient, Provider, Prisma } from "@prisma/client";
import { parseModelCapabilities } from "../src/lib/model-capabilities";

const prisma = new PrismaClient();

type ReplicateAPIModel = {
  latest_version?: {
    openapi_schema?: unknown;
  } | null;
};

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

async function backfillInputMaps() {
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

      const openapiSchema = replicateData?.latest_version?.openapi_schema ?? null;
      const capabilities = parseModelCapabilities(openapiSchema);

      // Build inputMap if we detected an image input field
      const inputMap: Record<string, string> = {};
      if (capabilities.imageInputField?.name) {
        inputMap.referenceUrls = capabilities.imageInputField.name;
      }

      // If no inputMap needed, skip
      if (Object.keys(inputMap).length === 0) {
        console.log(`  ⊘ No image input field detected, skipping`);
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
        replicate: {
          ...(existingMetadata.replicate &&
          typeof existingMetadata.replicate === "object"
            ? (existingMetadata.replicate as Record<string, unknown>)
            : {}),
          inputMap,
        },
      };

      await prisma.providerModel.update({
        where: { id: model.id },
        data: {
          metadata: updatedMetadata as Prisma.InputJsonValue,
        },
      });

      console.log(
        `  ✓ Updated with inputMap: referenceUrls -> ${capabilities.imageInputField?.name ?? "unknown"}`
      );
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
  console.log(`Skipped (no image input): ${skipped}`);
  console.log(`Failed: ${failed}`);
}

backfillInputMaps()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
