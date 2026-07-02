export const FIXED_STEP_COSTS: Record<string, number> = { llm: 1, merge: 2 };

/** Build the PlanContext cost fn from a map of providerModelId -> creditCost.
 * Steps with a providerModelId use that model's cost (throws if unknown);
 * steps without use FIXED_STEP_COSTS[stepType] ?? 0. */
export function buildCostFn(
  modelCosts: Record<string, number>,
): (stepType: string, providerModelId?: string | null) => number {
  return (stepType, providerModelId) => {
    if (providerModelId) {
      const c = modelCosts[providerModelId];
      if (c === undefined) throw new Error(`Unknown provider model cost: ${providerModelId}`);
      return c;
    }
    return FIXED_STEP_COSTS[stepType] ?? 0;
  };
}
