-- Remove deprecated provider credentials before shrinking the enum.
DELETE FROM "ProviderCredential"
WHERE "provider"::text IN ('LUMA', 'STABILITY');

DELETE FROM "ProviderModel"
WHERE "provider"::text IN ('LUMA', 'STABILITY');

-- Recreate the Provider enum with the supported values only.
DO $$
DECLARE
  provider_enum_exists BOOLEAN := EXISTS (SELECT 1 FROM pg_type WHERE typname = 'provider');
  provider_credential_exists BOOLEAN := EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'ProviderCredential'
  );
  provider_model_exists BOOLEAN := EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'ProviderModel'
  );
BEGIN
  IF provider_enum_exists THEN
    CREATE TYPE "Provider_new" AS ENUM ('REPLICATE', 'GEMINI', 'OPENAI');

    IF provider_credential_exists THEN
      ALTER TABLE "ProviderCredential"
      ALTER COLUMN "provider" TYPE "Provider_new"
      USING "provider"::text::"Provider_new";
    END IF;

    IF provider_model_exists THEN
      ALTER TABLE "ProviderModel"
      ALTER COLUMN "provider" TYPE "Provider_new"
      USING "provider"::text::"Provider_new";
    END IF;

    DROP TYPE "Provider";
    ALTER TYPE "Provider_new" RENAME TO "Provider";
  END IF;
END$$;
