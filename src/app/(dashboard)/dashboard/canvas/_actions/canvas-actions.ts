"use server";

import { z } from "zod";

import { createImageJob } from "@/lib/jobs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

// --- Save Canvas ---

const saveCanvasSchema = z.object({
  nodes: z.array(z.unknown()),
  edges: z.array(z.unknown()),
  viewport: z.object({
    x: z.number(),
    y: z.number(),
    zoom: z.number(),
  }),
});

export async function saveCanvasAction(
  canvasId: string,
  data: { nodes: unknown[]; edges: unknown[]; viewport: { x: number; y: number; zoom: number } },
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return { ok: false, error: "Not authenticated" };
  }

  const parsed = saveCanvasSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: "Invalid canvas data" };
  }

  await prisma.canvas.update({
    where: { id: canvasId, userId: session.user.id },
    data: {
      nodes: parsed.data.nodes as Parameters<typeof JSON.stringify>[0],
      edges: parsed.data.edges as Parameters<typeof JSON.stringify>[0],
      viewport: parsed.data.viewport as Parameters<typeof JSON.stringify>[0],
    },
  });

  return { ok: true };
}

// --- Generate from Canvas ---

const generateSchema = z.object({
  prompt: z.string().min(1, "Prompt is required"),
  negativePrompt: z.string().optional(),
  providerModelId: z.string().min(1, "Select a model"),
  aspectRatio: z.string().default("1:1"),
  referenceAssetIds: z.array(z.string()).max(8).default([]),
});

export async function generateFromCanvasAction(input: {
  prompt: string;
  negativePrompt?: string;
  providerModelId: string;
  aspectRatio: string;
  referenceAssetIds?: string[];
}) {
  const session = await getSession();
  if (!session?.user?.id) {
    return { ok: false as const, error: "Not authenticated" };
  }

  const parsed = generateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  try {
    const result = await createImageJob({
      userId: session.user.id,
      prompt: parsed.data.prompt,
      negativePrompt: parsed.data.negativePrompt,
      providerModelId: parsed.data.providerModelId,
      aspectRatio: parsed.data.aspectRatio,
      referenceAssetIds: parsed.data.referenceAssetIds,
    });

    return {
      ok: true as const,
      jobId: result.jobId,
      balanceAfter: result.balanceAfter,
    };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Failed to start generation",
    };
  }
}

// --- Create Canvas ---

export async function createCanvasAction(name?: string) {
  const session = await getSession();
  if (!session?.user?.id) {
    return { ok: false as const, error: "Not authenticated" };
  }

  const canvas = await prisma.canvas.create({
    data: {
      userId: session.user.id,
      name: name ?? "Untitled Canvas",
    },
  });

  return { ok: true as const, canvasId: canvas.id };
}

// --- Get Canvas Job Statuses ---

export async function getCanvasJobStatusAction(jobIds: string[]) {
  const session = await getSession();
  if (!session?.user?.id) {
    return [];
  }

  if (!jobIds.length) return [];

  const jobs = await prisma.job.findMany({
    where: {
      id: { in: jobIds },
      userId: session.user.id,
    },
    select: {
      id: true,
      status: true,
      result: true,
      outputAsset: {
        select: {
          id: true,
          url: true,
          thumbnail: true,
        },
      },
    },
  });

  return jobs.map((job) => ({
    jobId: job.id,
    status: job.status,
    error:
      job.status === "FAILED" && job.result && typeof job.result === "object"
        ? (job.result as Record<string, unknown>).error as string | undefined
        : undefined,
    outputAsset: job.outputAsset
      ? {
          id: job.outputAsset.id,
          url: job.outputAsset.url,
          thumbnail: job.outputAsset.thumbnail ?? job.outputAsset.url,
        }
      : undefined,
  }));
}
