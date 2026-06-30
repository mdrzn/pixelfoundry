import { PrismaClient, Provider } from "@prisma/client";

const prisma = new PrismaClient();

type ReplicateModel = {
  url: string;
  owner: string;
  name: string;
  description: string | null;
  visibility: string;
  github_url: string | null;
  paper_url: string | null;
  license_url: string | null;
  run_count: number;
  cover_image_url: string | null;
  default_example: {
    id: string;
    model: string;
    version: string;
    input: Record<string, unknown>;
    output: unknown;
  } | null;
  latest_version: {
    id: string;
    created_at: string;
    cog_version: string;
    openapi_schema: Record<string, unknown>;
  } | null;
};

async function fetchReplicateModel(
  apiKey: string,
  owner: string,
  name: string
): Promise<ReplicateModel | null> {
  try {
    const response = await fetch(
      `https://api.replicate.com/v1/models/${owner}/${name}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      console.error(
        `Failed to fetch ${owner}/${name}: ${response.status} ${response.statusText}`
      );
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error(`Error fetching ${owner}/${name}:`, error);
    return null;
  }
}

async function backfillDescriptions() {
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
      description: null,
    },
    select: {
      id: true,
      slug: true,
      displayName: true,
    },
  });

  console.log(`Found ${models.length} Replicate models without descriptions\n`);

  let updated = 0;
  let failed = 0;

  for (const model of models) {
    // Parse slug to get owner and name
    const parts = model.slug.split("/");
    if (parts.length !== 2) {
      console.error(`Invalid slug format: ${model.slug}`);
      failed++;
      continue;
    }

    const [owner, name] = parts;
    console.log(`Fetching ${owner}/${name}...`);

    const replicateData = await fetchReplicateModel(credential.apiKey, owner, name);

    if (!replicateData) {
      console.error(`  ✗ Failed to fetch model data`);
      failed++;
      continue;
    }

    const description = replicateData.description || null;

    if (!description) {
      console.log(`  ⚠ No description available from Replicate`);
      continue;
    }

    // Update the model with the description
    await prisma.providerModel.update({
      where: { id: model.id },
      data: { description },
    });

    console.log(`  ✓ Updated with description: ${description.substring(0, 80)}...`);
    updated++;

    // Add a small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total models processed: ${models.length}`);
  console.log(`Successfully updated: ${updated}`);
  console.log(`Failed: ${failed}`);
  console.log(`No description available: ${models.length - updated - failed}`);
}

backfillDescriptions()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
