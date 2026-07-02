// Store the fal.ai API key as a ProviderCredential (server-side only).
// Run it in YOUR terminal so the key never lands in a chat transcript:
//   FAL_KEY='your-fal-key' node scripts/set-fal-credential.mjs
import { PrismaClient, Provider } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const key = process.env.FAL_KEY || process.argv[2];
  if (!key) {
    console.error("Missing key. Usage: FAL_KEY='...' node scripts/set-fal-credential.mjs");
    process.exit(1);
  }
  await prisma.providerCredential.upsert({
    where: { provider: Provider.FAL },
    create: { provider: Provider.FAL, apiKey: key, label: "fal.ai", isActive: true },
    update: { apiKey: key, isActive: true },
  });
  console.log("fal.ai credential stored (isActive=true). Key value not printed.");
}

main()
  .catch((e) => { console.error("Failed:", e.message); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
