-- Simplify the ProviderModel table to match the new catalog shape.
ALTER TABLE "ProviderModel"
DROP COLUMN IF EXISTS "baseUnitCost",
DROP COLUMN IF EXISTS "baseUnit",
DROP COLUMN IF EXISTS "feeMultiplier";
