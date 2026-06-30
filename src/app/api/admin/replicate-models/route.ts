import { JobType, Provider } from "@prisma/client";
import { NextResponse } from "next/server";

import { getProviderCredentialSecret, requireAdminUser } from "@/lib/admin";
import { parseModelCapabilities } from "@/lib/model-capabilities";

const REPLICATE_API_BASE = "https://api.replicate.com/v1";

type ReplicateAPIModel = {
  owner?: string | null;
  name?: string | null;
  description?: string | null;
  github_url?: string | null;
  visibility?: string | null;
  run_count?: number | null;
  logo_url?: string | null;
  latest_version?: {
    id?: string | null;
    created_at?: string | null;
    openapi_schema?: unknown;
    pricing?: {
      unit_price?: number | string | null;
      currency?: string | null;
      unit_type?: string | null;
    } | null;
  } | null;
};

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractCursor(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  try {
    const url = new URL(value, REPLICATE_API_BASE);
    return url.searchParams.get("cursor") ?? value;
  } catch {
    return value;
  }
}

function estimateCreditCost(unitPrice: number | null): number | null {
  if (unitPrice === null) {
    return null;
  }
  const creditsPerUsd = 100;
  return Math.max(1, Math.ceil(unitPrice * creditsPerUsd));
}

function inferJobType(slug: string, displayName: string, description?: string | null): JobType {
  const haystack = `${slug} ${displayName} ${description ?? ""}`.toLowerCase();

  if (
    haystack.includes("video") ||
    haystack.includes("animation") ||
    haystack.includes("motion") ||
    haystack.includes("veo") ||
    haystack.includes("sora")
  ) {
    return JobType.CREATE_VIDEO;
  }

  if (
    haystack.includes("edit") ||
    haystack.includes("inpaint") ||
    haystack.includes("outpaint") ||
    haystack.includes("erase") ||
    haystack.includes("retouch")
  ) {
    return JobType.EDIT_IMAGE;
  }

  return JobType.CREATE_IMAGE;
}

// Removed unused fetchReplicateModels function - using inline implementation in GET handler

async function fetchReplicateModelDetail(apiKey: string, slug: string) {
  const response = await fetch(`${REPLICATE_API_BASE}/models/${slug}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (response.status === 404) {
    throw new Error(`Model ${slug} is not available on Replicate.`);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Unable to look up that model on Replicate.");
  }

  const data = await response.json();
  return data as ReplicateAPIModel;
}

function buildModelResponse(slug: string, model: ReplicateAPIModel) {
  const displayName = model?.name ?? model?.owner ?? slug;
  const pricing = model?.latest_version?.pricing ?? null;
  const unitPrice = parseNumber(pricing?.unit_price);
  const currency = pricing?.currency ?? "USD";
  const unitType = pricing?.unit_type ?? null;
  const suggestedCreditCost = estimateCreditCost(unitPrice);

  // Parse model capabilities to detect image input field name
  const openapiSchema = model?.latest_version?.openapi_schema ?? null;
  const capabilities = parseModelCapabilities(openapiSchema);

  // Build inputMap if we detected an image input field
  const inputMap: Record<string, string> = {};
  if (capabilities.imageInputField?.name) {
    inputMap.referenceUrls = capabilities.imageInputField.name;
  }

  return {
    slug,
    displayName,
    description: model?.description ?? "",
    defaultJobType: inferJobType(slug, displayName, model?.description),
    suggestedCreditCost,
    metadata: {
      owner: model?.owner ?? null,
      visibility: model?.visibility ?? null,
      runCount: model?.run_count ?? null,
      logoUrl: model?.logo_url ?? null,
      latestVersionId: model?.latest_version?.id ?? null,
      openapi_schema: openapiSchema,
      pricing: {
        unitPriceUSD: unitPrice,
        unitType,
        currency,
      },
      replicate: Object.keys(inputMap).length > 0 ? { inputMap } : undefined,
    },
  };
}

export async function GET(request: Request) {
  await requireAdminUser();
  const url = new URL(request.url);
  const slugQuery = url.searchParams.get("slug")?.trim();
  const searchQuery = url.searchParams.get("query")?.trim();
  const jobTypeFilter = url.searchParams.get("jobType")?.trim();
  const cursorParam = url.searchParams.get("cursor")?.trim();
  const sortBy = url.searchParams.get("sortBy")?.trim() || "popularity";
  const fetchAll = url.searchParams.get("fetchAll") === "true";

  let credential;
  try {
    credential = await getProviderCredentialSecret(Provider.REPLICATE);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Replicate is not configured yet.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    // Single model lookup
    if (slugQuery) {
      if (!slugQuery.includes("/")) {
        return NextResponse.json(
          { error: "Provide the owner/model slug, e.g. google/nano-banana." },
          { status: 400 },
        );
      }

      const detail = await fetchReplicateModelDetail(credential.apiKey, slugQuery);
      const model = buildModelResponse(slugQuery, detail);
      return NextResponse.json({ model });
    }

    // Fetch models with pagination
    const allResults: ReplicateAPIModel[] = [];
    let currentCursor: string | null = cursorParam || null;
    let pagesFetched = 0;
    let timeoutOccurred = false;

    // Reduced from 100 to 40 pages to avoid serverless timeout
    // 40 pages × 50 models = 2000 models (completes in ~20-40 seconds)
    const maxPages = fetchAll ? 40 : 2; // Fetch 2 pages initially (100 models) for better UX

    do {
      const fetchUrl = new URL(`${REPLICATE_API_BASE}/models`);
      fetchUrl.searchParams.set("public", "true");

      // Always use 50 per page for better performance
      const pageSize = 50;
      fetchUrl.searchParams.set("per_page", String(pageSize));

      if (searchQuery) {
        fetchUrl.searchParams.set("query", searchQuery);
      }

      if (currentCursor) {
        fetchUrl.searchParams.set("cursor", currentCursor);
      }

      let response;
      let data;
      let results: ReplicateAPIModel[] = [];

      try {
        response = await fetch(fetchUrl.toString(), {
          headers: {
            Authorization: `Bearer ${credential.apiKey}`,
            "Content-Type": "application/json",
          },
          cache: "no-store",
        });

        if (!response.ok) {
          const text = await response.text();
          // If we've already fetched some models, return partial results
          if (allResults.length > 0) {
            timeoutOccurred = true;
            break;
          }
          throw new Error(text || "Unable to fetch models from Replicate");
        }

        data = await response.json();
        results = Array.isArray(data?.results) ? data.results : [];
      } catch (error) {
        // If we've already fetched some models, return what we have
        if (allResults.length > 0) {
          timeoutOccurred = true;
          console.warn(`Fetch interrupted after ${pagesFetched} pages:`, error);
          break;
        }
        // Otherwise, throw the error
        throw error;
      }

      allResults.push(...results);
      pagesFetched++;

      // Extract next cursor
      const nextCursor =
        extractCursor(data?.next) ??
        extractCursor(data?.next_cursor) ??
        (typeof data?.cursor === "string" ? data.cursor : null);

      // Stop if no more results or no cursor
      if (results.length === 0 || !nextCursor) {
        currentCursor = null;
        break;
      }

      currentCursor = nextCursor;

      // If not fetching all, break after first page
      if (!fetchAll) {
        break;
      }
    } while (currentCursor && pagesFetched < maxPages);

    // Build unique models map
    const unique = new Map<string, ReplicateAPIModel>();
    for (const model of allResults) {
      const owner = model?.owner ?? undefined;
      const name = model?.name ?? undefined;
      const slug =
        owner && name ? `${owner}/${name}` : name ?? owner ?? `model-${Math.random().toString(36).slice(2, 8)}`;
      if (!unique.has(slug)) {
        unique.set(slug, model);
      }
    }

    let models = Array.from(unique.entries()).map(([slug, model]) =>
      buildModelResponse(slug, model),
    );

    // Client-side job type filtering (since Replicate doesn't support this)
    if (jobTypeFilter && jobTypeFilter !== "ALL") {
      models = models.filter((model) => model.defaultJobType === jobTypeFilter);
    }

    // Sort models based on sortBy parameter
    models.sort((a, b) => {
      switch (sortBy) {
        case "popularity": {
          // Most popular first (highest run count)
          const aRuns = (a.metadata?.runCount as number) ?? 0;
          const bRuns = (b.metadata?.runCount as number) ?? 0;
          return bRuns - aRuns;
        }
        case "name-asc": {
          // Alphabetical A-Z
          return a.displayName.localeCompare(b.displayName);
        }
        case "name-desc": {
          // Alphabetical Z-A
          return b.displayName.localeCompare(a.displayName);
        }
        case "recent": {
          // Most recently created first
          const aDate = (a.metadata?.latestVersionId as string) ?? "";
          const bDate = (b.metadata?.latestVersionId as string) ?? "";
          return bDate.localeCompare(aDate);
        }
        default: {
          // Default to popularity
          const aRuns = (a.metadata?.runCount as number) ?? 0;
          const bRuns = (b.metadata?.runCount as number) ?? 0;
          return bRuns - aRuns;
        }
      }
    });

    return NextResponse.json({
      models,
      nextCursor: fetchAll ? null : currentCursor, // No cursor when fetching all
      hasMore: fetchAll ? false : !!currentCursor, // No more when fetching all
      totalFetched: models.length,
      fetchedAll: fetchAll && !timeoutOccurred,
      timeoutOccurred,
      pagesFetched,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to fetch models from Replicate right now.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
