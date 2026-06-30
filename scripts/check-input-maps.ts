import { PrismaClient, Provider } from "@prisma/client";

const prisma = new PrismaClient();

async function checkInputMaps() {
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

  console.log(`Checking ${models.length} Replicate models for inputMap...\n`);

  for (const model of models) {
    const metadata =
      model.metadata && typeof model.metadata === "object"
        ? (model.metadata as Record<string, unknown>)
        : null;

    const replicateConfig =
      metadata?.replicate && typeof metadata.replicate === "object"
        ? (metadata.replicate as Record<string, unknown>)
        : null;

    const inputMap =
      replicateConfig?.inputMap && typeof replicateConfig.inputMap === "object"
        ? (replicateConfig.inputMap as Record<string, unknown>)
        : null;

    console.log(`Model: ${model.slug}`);
    console.log(`  Has replicate config: ${!!replicateConfig}`);
    console.log(`  Has inputMap: ${!!inputMap}`);
    if (inputMap) {
      console.log(`  inputMap:`, JSON.stringify(inputMap, null, 2));
    }
    console.log();
  }
}

checkInputMaps()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
