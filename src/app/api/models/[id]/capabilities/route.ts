import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { parseModelCapabilities } from "@/lib/model-capabilities";
import { getSession } from "@/lib/session";

export const revalidate = 3600; // Cache for 1 hour

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  request: Request,
  context: RouteContext
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const params = await context.params;
  const modelId = params.id;

  if (!modelId) {
    return NextResponse.json(
      { error: "Model ID is required" },
      { status: 400 }
    );
  }

  try {
    const model = await prisma.providerModel.findUnique({
      where: { id: modelId },
      select: { metadata: true },
    });

    if (!model) {
      return NextResponse.json(
        { error: "Model not found" },
        { status: 404 }
      );
    }

    const metadata = model.metadata as Record<string, unknown> | null;
    const openapi_schema = metadata?.openapi_schema ?? null;

    const capabilities = parseModelCapabilities(openapi_schema);

    return NextResponse.json({ capabilities });
  } catch (error) {
    console.error("Error fetching model capabilities:", error);
    return NextResponse.json(
      { error: "Failed to fetch model capabilities" },
      { status: 500 }
    );
  }
}
