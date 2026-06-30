import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

const paramsSchema = z.object({
  presetId: z.string().min(1),
});

type RouteContext = {
  params: Promise<{
    presetId: string;
  }>;
};

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = await context.params;
  const parsed = paramsSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid preset id." }, { status: 400 });
  }

  const preset = await prisma.imagePreset.findUnique({
    where: { id: parsed.data.presetId },
    select: {
      id: true,
      userId: true,
    },
  });

  if (!preset) {
    return NextResponse.json({ error: "Preset not found." }, { status: 404 });
  }

  const isOwner = preset.userId === session.user.id;
  const isAdmin = session.user.role === UserRole.ADMIN;

  if (!isOwner && !isAdmin) {
    return NextResponse.json(
      { error: "You do not have permission to delete this preset." },
      { status: 403 },
    );
  }

  await prisma.imagePreset.delete({
    where: { id: preset.id },
  });

  return NextResponse.json({ ok: true });
}
