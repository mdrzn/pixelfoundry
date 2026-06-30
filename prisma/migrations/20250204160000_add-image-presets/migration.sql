-- Introduce preset management and job input asset tracking for image workflows.

CREATE TYPE "PresetVisibility" AS ENUM ('PRIVATE', 'TEAM', 'GLOBAL');

CREATE TYPE "JobAssetRole" AS ENUM ('REFERENCE', 'VARIATION', 'MASK');

CREATE TABLE "ImagePreset" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "visibility" "PresetVisibility" NOT NULL DEFAULT 'PRIVATE',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "providerModelId" TEXT,
    "prompt" TEXT NOT NULL,
    "negativePrompt" TEXT,
    "aspectRatio" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "cfgScale" DOUBLE PRECISION,
    "steps" INTEGER,
    "seed" INTEGER,
    "sampler" TEXT,
    "outputCount" INTEGER NOT NULL DEFAULT 1,
    "upscale" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImagePreset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImagePresetReference" (
    "id" TEXT NOT NULL,
    "presetId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImagePresetReference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobInputAsset" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "role" "JobAssetRole" NOT NULL DEFAULT 'REFERENCE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobInputAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImagePreset_userId_idx" ON "ImagePreset"("userId");
CREATE INDEX "ImagePreset_visibility_idx" ON "ImagePreset"("visibility");
CREATE INDEX "ImagePreset_providerModelId_idx" ON "ImagePreset"("providerModelId");

CREATE UNIQUE INDEX "ImagePresetReference_presetId_assetId_key" ON "ImagePresetReference"("presetId", "assetId");
CREATE INDEX "ImagePresetReference_assetId_idx" ON "ImagePresetReference"("assetId");

CREATE INDEX "JobInputAsset_jobId_idx" ON "JobInputAsset"("jobId");
CREATE INDEX "JobInputAsset_assetId_idx" ON "JobInputAsset"("assetId");

ALTER TABLE "ImagePreset"
    ADD CONSTRAINT "ImagePreset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "ImagePreset_providerModelId_fkey" FOREIGN KEY ("providerModelId") REFERENCES "ProviderModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ImagePresetReference"
    ADD CONSTRAINT "ImagePresetReference_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "ImagePreset"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "ImagePresetReference_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JobInputAsset"
    ADD CONSTRAINT "JobInputAsset_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "JobInputAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
