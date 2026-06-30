import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkModels() {
  const models = await prisma.providerModel.findMany({
    select: {
      id: true,
      provider: true,
      slug: true,
      displayName: true,
      description: true,
    },
    orderBy: {
      provider: "asc",
    },
  });

  console.log("Total models:", models.length);
  console.log("\nModels with descriptions:", models.filter((m) => m.description).length);
  console.log("Models without descriptions:", models.filter((m) => !m.description).length);

  console.log("\n=== Models without descriptions ===");
  models
    .filter((m) => !m.description)
    .forEach((m) => {
      console.log(`- ${m.provider}/${m.slug} (${m.displayName})`);
    });

  console.log("\n=== Models with descriptions ===");
  models
    .filter((m) => m.description)
    .forEach((m) => {
      console.log(`- ${m.provider}/${m.slug} (${m.displayName})`);
      console.log(`  Description: ${m.description?.substring(0, 80)}...`);
    });
}

checkModels()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
