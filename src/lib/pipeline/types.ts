import type { PipelineType } from "@prisma/client";

export type PlannedStep = {
  key: string;
  name: string;
  stepType: string;
  dependsOn: string[];
  input: unknown;
  providerModelId?: string;
  cost: number;
};

export type PlanContext = {
  /** Cost (credits) for a step of the given type / model. */
  cost: (stepType: string, providerModelId?: string) => number;
};

export type CompletedStep = { key: string; output: unknown };

export interface PipelineDefinition {
  type: PipelineType;
  plan(params: Record<string, unknown>, ctx: PlanContext): PlannedStep[];
  expand(completed: CompletedStep, params: Record<string, unknown>, ctx: PlanContext): PlannedStep[];
  estimateUpperBound(params: Record<string, unknown>, ctx: PlanContext): number;
}
