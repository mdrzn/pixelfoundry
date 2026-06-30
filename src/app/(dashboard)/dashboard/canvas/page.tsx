import { redirect } from "next/navigation";
import { JobType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

import { CanvasClient } from "./canvas-client";
import type { ModelOption, SerializedCanvas } from "./_lib/canvas-types";

export default async function CanvasPage() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  const userId = session.user.id;

  // Load or create the user's canvas
  let canvas = await prisma.canvas.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });

  if (!canvas) {
    canvas = await prisma.canvas.create({
      data: { userId },
    });
  }

  // Load active image generation models
  const models = await prisma.providerModel.findMany({
    where: {
      isActive: true,
      jobTypes: { has: JobType.CREATE_IMAGE },
    },
    orderBy: [{ provider: "asc" }, { displayName: "asc" }],
  });

  const modelOptions: ModelOption[] = models.map((model) => ({
    value: model.id,
    label: model.displayName,
    description: model.description,
    creditCost: model.creditCost,
    provider: model.provider,
  }));

  const serializedCanvas: SerializedCanvas = {
    id: canvas.id,
    nodes: canvas.nodes as unknown[],
    edges: canvas.edges as unknown[],
    viewport: canvas.viewport as { x: number; y: number; zoom: number },
  };

  return <CanvasClient canvas={serializedCanvas} models={modelOptions} />;
}
