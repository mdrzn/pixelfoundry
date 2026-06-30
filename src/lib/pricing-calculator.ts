/**
 * Pricing Calculator Utility
 *
 * Handles dynamic pricing calculation for models with tiered pricing structures.
 * Supports both per-run and per-second pricing models.
 */

type PricingTier = {
  resolution?: string;
  unitPriceUSD: number;
  unitType?: string;
  aspectRatios?: string[];
};

type ModelMetadata = {
  pricing?: {
    model?: "per-second" | "per-run";
    tiers?: PricingTier[];
    currency?: string;
  };
};

export type PricingResult = {
  creditsPerUnit: number;
  totalCredits: number;
  unitType: "run" | "second";
  description: string;
};

/**
 * Calculate total credit cost for a generation based on model pricing structure.
 *
 * @param creditCost - The base credit cost from the database (credits per run or per second)
 * @param metadata - The model metadata containing pricing information
 * @param options - Optional parameters for video models (duration, resolution)
 * @returns PricingResult with total credits and description
 */
export function calculatePricing(
  creditCost: number,
  metadata?: unknown,
  options?: {
    duration?: number; // For video models (in seconds)
    resolution?: string; // For tiered pricing
  },
): PricingResult {
  const meta = metadata as ModelMetadata | undefined;
  const pricingModel = meta?.pricing?.model;

  // Per-second pricing (video models)
  if (pricingModel === "per-second" && options?.duration) {
    const totalCredits = creditCost * options.duration;
    return {
      creditsPerUnit: creditCost,
      totalCredits,
      unitType: "second",
      description: `${creditCost} credits/sec × ${options.duration}s`,
    };
  }

  // Per-run pricing (default for images and non-tiered models)
  return {
    creditsPerUnit: creditCost,
    totalCredits: creditCost,
    unitType: "run",
    description: `${creditCost} credits`,
  };
}

/**
 * Format pricing for display in the UI.
 *
 * @param result - The pricing result from calculatePricing
 * @returns Formatted string for display (e.g., "Generate (120 credits)")
 */
export function formatPricingDisplay(result: PricingResult): string {
  return `${result.totalCredits} credits`;
}

/**
 * Get available durations for a video model from capabilities metadata.
 *
 * @param metadata - The model metadata
 * @returns Array of available durations in seconds, or default [4, 8, 12]
 */
export function getAvailableDurations(metadata?: unknown): number[] {
  const meta = metadata as { capabilities?: { durations?: number[] } } | undefined;
  return meta?.capabilities?.durations ?? [4, 8, 12];
}

/**
 * Get available resolutions for a model from capabilities metadata.
 *
 * @param metadata - The model metadata
 * @returns Array of available resolutions
 */
export function getAvailableResolutions(metadata?: unknown): string[] {
  const meta = metadata as { capabilities?: { resolutions?: string[] } } | undefined;
  return meta?.capabilities?.resolutions ?? ["720p"];
}

/**
 * Get available aspect ratios for a model from capabilities metadata.
 *
 * @param metadata - The model metadata
 * @returns Array of available aspect ratios
 */
export function getAvailableAspectRatios(metadata?: unknown): string[] {
  const meta = metadata as { capabilities?: { aspectRatios?: string[] } } | undefined;
  return meta?.capabilities?.aspectRatios ?? ["portrait", "landscape"];
}
