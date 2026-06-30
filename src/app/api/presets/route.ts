import { NextRequest, NextResponse } from "next/server";
import { PresetVisibility, Provider, UserRole } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

const aspectRatioPattern = /^(\d{1,2}):(\d{1,2})$/;

const optionalString = z.preprocess((value) => {
  if (value === null || value === undefined) {
    return undefined;
  }
  const trimmed = value.toString().trim();
  return trimmed.length ? trimmed : undefined;
}, z.string().min(1).optional());

const numeric = (schema: z.ZodTypeAny) =>
  z.preprocess((value) => {
    if (value === null || value === undefined || value === "") {
      return undefined;
    }
    if (typeof value === "number") {
      return value;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }, schema);

const presetInputSchema = z
  .object({
    name: z.string().min(2).max(64),
    description: z.string().max(200).optional(),
    visibility: z.nativeEnum(PresetVisibility).default(PresetVisibility.PRIVATE),
    providerModelId: optionalString.optional(),
    prompt: z.string().min(10).max(800),
    negativePrompt: z.string().max(400).optional(),
    aspectRatio: z.string().regex(aspectRatioPattern).optional(),
    width: numeric(z.number().int().min(256).max(2048).optional()),
    height: numeric(z.number().int().min(256).max(2048).optional()),
    cfgScale: numeric(z.number().min(1).max(30).optional()),
    steps: numeric(z.number().int().min(10).max(250).optional()),
    seed: numeric(z.number().int().min(0).max(2_147_483_647).optional()),
    sampler: z.string().max(64).optional(),
    outputCount: numeric(z.number().int().min(1).max(8).default(1)),
    upscale: z.boolean().optional(),
    tags: z.array(z.string().min(1).max(32)).max(16).default([]),
    referenceAssetIds: z.array(z.string()).max(8).default([]),
  })
  .superRefine((value, ctx) => {
    if ((value.width && !value.height) || (!value.width && value.height)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide both width and height or leave both blank.",
        path: ["width"],
      });
    }
  });

type PresetRecord = {
  id: string;
  userId: string | null;
  visibility: PresetVisibility;
  name: string;
  description: string | null;
  providerModelId: string | null;
  prompt: string;
  negativePrompt: string | null;
  aspectRatio: string | null;
  width: number | null;
  height: number | null;
  cfgScale: number | null;
  steps: number | null;
  seed: number | null;
  sampler: string | null;
  outputCount: number;
  upscale: boolean;
  metadata: unknown;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  references: Array<{
    assetId: string;
    asset: {
      id: string;
      title: string | null;
      url: string;
      thumbnail: string | null;
      createdAt: Date;
    } | null;
  }>;
  providerModel: {
    id: string;
    displayName: string;
    provider: Provider;
    creditCost: number | null;
    metadata: unknown;
  } | null;
};

function serializePreset(preset: PresetRecord) {
  return {
    id: preset.id,
    userId: preset.userId,
    visibility: preset.visibility,
    name: preset.name,
    description: preset.description,
    providerModelId: preset.providerModelId,
    prompt: preset.prompt,
    negativePrompt: preset.negativePrompt,
    aspectRatio: preset.aspectRatio,
    width: preset.width,
    height: preset.height,
    cfgScale: preset.cfgScale,
    steps: preset.steps,
    seed: preset.seed,
    sampler: preset.sampler,
    outputCount: preset.outputCount,
    upscale: preset.upscale,
    metadata: preset.metadata,
    tags: preset.tags,
    createdAt: preset.createdAt.toISOString(),
    updatedAt: preset.updatedAt.toISOString(),
    references: preset.references
      .filter((reference) => reference.asset)
      .map((reference) => ({
        assetId: reference.assetId,
        asset: {
          id: reference.asset!.id,
          title: reference.asset!.title,
          url: reference.asset!.url,
          thumbnail: reference.asset!.thumbnail ?? reference.asset!.url,
          createdAt: reference.asset!.createdAt.toISOString(),
        },
      })),
    providerModel: preset.providerModel
      ? {
          id: preset.providerModel.id,
          displayName: preset.providerModel.displayName,
          provider: preset.providerModel.provider,
          creditCost: preset.providerModel.creditCost,
          metadata: preset.providerModel.metadata,
        }
      : null,
  };
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  const userId = session?.user?.id ?? null;
  const includeShared = request.nextUrl.searchParams.get("includeShared") !== "false";

  const visibilityFilters = includeShared
    ? [{ visibility: PresetVisibility.GLOBAL }, { visibility: PresetVisibility.TEAM }]
    : [];

  const presets = (await prisma.imagePreset.findMany({
    where: userId
      ? {
          OR: [
            ...visibilityFilters,
            {
              userId,
            },
          ],
        }
      : {
          OR: visibilityFilters.length ? visibilityFilters : [{ visibility: PresetVisibility.GLOBAL }],
        },
    include: {
      references: {
        include: {
          asset: {
            select: {
              id: true,
              title: true,
              url: true,
              thumbnail: true,
              createdAt: true,
            },
          },
        },
      },
      providerModel: {
        select: {
          id: true,
          displayName: true,
          provider: true,
          creditCost: true,
          metadata: true,
        },
      },
    },
    orderBy: [{ visibility: "asc" }, { name: "asc" }],
  })) as PresetRecord[];

  return NextResponse.json(presets.map(serializePreset));
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const parsed = presetInputSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid preset payload." },
      { status: 422 },
    );
  }

  if (
    parsed.data.visibility === PresetVisibility.GLOBAL &&
    session.user.role !== UserRole.ADMIN
  ) {
    return NextResponse.json(
      { error: "Only administrators can publish global presets." },
      { status: 403 },
    );
  }

  const referenceAssetIds = Array.from(new Set(parsed.data.referenceAssetIds));
  if (referenceAssetIds.length) {
    const assets = await prisma.asset.findMany({
      where: {
        id: { in: referenceAssetIds },
        userId: session.user.id,
      },
      select: { id: true },
    });

    if (assets.length !== referenceAssetIds.length) {
      return NextResponse.json(
        { error: "One or more reference images were not found or cannot be used." },
        { status: 404 },
      );
    }
  }

  const normalizedTags = Array.from(
    new Set(
      parsed.data.tags
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0),
    ),
  );

  const preset = (await prisma.imagePreset.create({
    data: {
      userId: session.user.id,
      visibility: parsed.data.visibility,
      name: parsed.data.name,
      description: parsed.data.description,
      providerModelId: parsed.data.providerModelId ?? null,
      prompt: parsed.data.prompt,
      negativePrompt: parsed.data.negativePrompt,
      aspectRatio: parsed.data.aspectRatio,
      width: parsed.data.width as number | undefined,
      height: parsed.data.height as number | undefined,
      cfgScale: parsed.data.cfgScale as number | undefined,
      steps: parsed.data.steps as number | undefined,
      seed: parsed.data.seed as number | undefined,
      sampler: parsed.data.sampler,
      outputCount: parsed.data.outputCount as number,
      upscale: parsed.data.upscale ?? false,
      metadata: {
        createdVia: "dashboard",
      },
      tags: normalizedTags,
      references: referenceAssetIds.length
        ? {
            createMany: {
              data: referenceAssetIds.map((assetId) => ({ assetId })),
            },
          }
        : undefined,
    },
    include: {
      references: {
        include: {
          asset: {
            select: {
              id: true,
              title: true,
              url: true,
              thumbnail: true,
              createdAt: true,
            },
          },
        },
      },
      providerModel: {
        select: {
          id: true,
          displayName: true,
          provider: true,
          creditCost: true,
          metadata: true,
        },
      },
    },
  })) as PresetRecord;

  return NextResponse.json(serializePreset(preset));
}
