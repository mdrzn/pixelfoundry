"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { JobType, Provider, type ProviderModel } from "@prisma/client";

import {
  createProviderModelAction,
  deleteProviderModelAction,
  toggleProviderModelAction,
  updateProviderModelAction,
  type ProviderModelActionResult,
} from "@/server/actions/provider-models";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const providerLabels: Record<Provider, string> = {
  [Provider.REPLICATE]: "Replicate",
  [Provider.GEMINI]: "Gemini",
  [Provider.OPENAI]: "OpenAI",
  [Provider.FAL]: "fal",
};

const jobTypeLabels: Record<JobType, string> = {
  [JobType.CREATE_IMAGE]: "Create image",
  [JobType.EDIT_IMAGE]: "Edit image",
  [JobType.CREATE_VIDEO]: "Create video",
};

const providerOrder: Provider[] = [Provider.REPLICATE, Provider.GEMINI, Provider.OPENAI];
const jobTypeOrder: JobType[] = [JobType.CREATE_IMAGE, JobType.EDIT_IMAGE, JobType.CREATE_VIDEO];

const providerFetchRoutes: Record<Provider, string> = {
  [Provider.REPLICATE]: "/api/admin/replicate-models",
  [Provider.GEMINI]: "/api/admin/gemini-models",
  [Provider.OPENAI]: "/api/admin/openai-models",
  [Provider.FAL]: "/api/admin/fal-models",
};

type ProviderModelManagerProps = {
  models: ProviderModel[];
};

type ProviderModelSuggestion = {
  provider: Provider;
  slug: string;
  displayName: string;
  description?: string;
  defaultJobType: JobType;
  suggestedCreditCost?: number | null;
  metadata?: Record<string, unknown> | null;
};

type PricingTier = {
  resolution?: string;
  unitPriceUSD: number;
  unitType?: string;
  aspectRatios?: string[];
};

type VendorPricingMetadata =
  | {
      // Legacy single-price structure
      unitPriceUSD?: number | null;
      unitType?: string | null;
      currency?: string | null;
    }
  | {
      // New tiered pricing structure
      model: "per-second" | "per-run";
      tiers: PricingTier[];
      currency: string;
    };

type ExtractedPricing =
  | {
      type: "single";
      unitPrice: number;
      currency: string;
      unitType: string | null;
    }
  | {
      type: "tiered";
      tiers: PricingTier[];
      currency: string;
      model: "per-second" | "per-run";
    };

function extractPricing(metadata?: Record<string, unknown> | null): ExtractedPricing | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const raw = (metadata as { pricing?: VendorPricingMetadata }).pricing;
  if (!raw || typeof raw !== "object") {
    return null;
  }

  // Check for new tiered structure
  if ("model" in raw && "tiers" in raw && Array.isArray(raw.tiers)) {
    const currency = typeof raw.currency === "string" && raw.currency.length > 0 ? raw.currency : "USD";
    return {
      type: "tiered",
      tiers: raw.tiers as PricingTier[],
      currency,
      model: raw.model as "per-second" | "per-run",
    };
  }

  // Legacy single-price structure
  if ("unitPriceUSD" in raw) {
    const unitPrice = typeof raw.unitPriceUSD === "number" ? raw.unitPriceUSD : null;
    const currency = typeof raw.currency === "string" && raw.currency.length > 0 ? raw.currency : "USD";
    const unitType = typeof raw.unitType === "string" && raw.unitType.length > 0 ? raw.unitType : null;

    if (unitPrice === null) {
      return null;
    }

    return {
      type: "single",
      unitPrice,
      currency,
      unitType,
    };
  }

  return null;
}

function formatPricingSummary(pricing: ExtractedPricing | null): string | null {
  if (!pricing) {
    return null;
  }

  const prefix = pricing.currency === "USD" ? "$" : `${pricing.currency} `;

  if (pricing.type === "single") {
    const price = pricing.unitPrice < 1 ? pricing.unitPrice.toFixed(4) : pricing.unitPrice.toFixed(2);
    const suffix = pricing.unitType ? ` per ${pricing.unitType}` : "";
    return `${prefix}${price}${suffix}`;
  }

  // Tiered pricing
  if (pricing.tiers.length === 1) {
    const tier = pricing.tiers[0];
    const price = tier.unitPriceUSD < 1 ? tier.unitPriceUSD.toFixed(4) : tier.unitPriceUSD.toFixed(2);
    const resolution = tier.resolution ? ` (${tier.resolution})` : "";
    const unitType = tier.unitType || (pricing.model === "per-second" ? "second" : "run");
    return `${prefix}${price}/${unitType}${resolution}`;
  }

  // Multiple tiers - show range
  const prices = pricing.tiers.map((t) => t.unitPriceUSD);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const minFormatted = minPrice < 1 ? minPrice.toFixed(4) : minPrice.toFixed(2);
  const maxFormatted = maxPrice < 1 ? maxPrice.toFixed(4) : maxPrice.toFixed(2);

  const resolutions = pricing.tiers.map((t) => t.resolution).filter(Boolean);
  const resRange = resolutions.length > 0 ? ` (${resolutions.join("-")})` : "";
  const unitType = pricing.tiers[0]?.unitType || (pricing.model === "per-second" ? "sec" : "run");

  return `${prefix}${minFormatted}-${maxFormatted}/${unitType}${resRange}`;
}

function normalizeSuggestion(provider: Provider, model: Record<string, unknown>): ProviderModelSuggestion {
  const slugRaw = model.slug ?? model.id ?? "";
  const slug =
    typeof slugRaw === "string" && slugRaw.length > 0
      ? slugRaw
      : `model-${Math.random().toString(36).slice(2, 8)}`;
  const displayNameRaw = model.displayName ?? model.name ?? slug;
  const displayName =
    typeof displayNameRaw === "string" && displayNameRaw.length > 0 ? displayNameRaw : slug;
  const description = typeof model.description === "string" ? model.description : "";
  const defaultJobType = parseJobType(model.defaultJobType);
  const suggestedCreditCost =
    typeof model.suggestedCreditCost === "number" && Number.isFinite(model.suggestedCreditCost)
      ? Number(model.suggestedCreditCost)
      : null;
  const metadata =
    model.metadata && typeof model.metadata === "object"
      ? (model.metadata as Record<string, unknown>)
      : null;

  return {
    provider,
    slug,
    displayName,
    description,
    defaultJobType,
    suggestedCreditCost,
    metadata,
  };
}

type SortOption = "popularity" | "name-asc" | "name-desc" | "recent";

type ProviderBrowserState = {
  loading: boolean;
  loadingMore: boolean;
  loaded: boolean;
  error?: string | null;
  models: ProviderModelSuggestion[];
  cursor: string | null;
  hasMore: boolean;
  searchQuery: string;
  jobTypeFilter: JobType | "ALL";
  sortBy: SortOption;
  fetchedAll: boolean;
  totalFetched: number;
  timeoutOccurred: boolean;
  pagesFetched: number;
};

type ProviderModelDraft = {
  provider: Provider;
  jobTypes: JobType[];
  displayName?: string;
  description?: string;
  slug?: string;
  creditCost?: number;
  suggestedCreditCost?: number | null;
  metadata?: Record<string, unknown> | null;
};

function parseJobType(value: unknown): JobType {
  if (value === JobType.CREATE_IMAGE || value === "CREATE_IMAGE") {
    return JobType.CREATE_IMAGE;
  }
  if (value === JobType.EDIT_IMAGE || value === "EDIT_IMAGE") {
    return JobType.EDIT_IMAGE;
  }
  if (value === JobType.CREATE_VIDEO || value === "CREATE_VIDEO") {
    return JobType.CREATE_VIDEO;
  }
  return JobType.CREATE_IMAGE;
}

export function ProviderModelManager({ models }: ProviderModelManagerProps) {
  const groupedByProvider = useMemo(() => {
    const result = new Map<Provider, ProviderModel[]>();

    for (const provider of providerOrder) {
      result.set(provider, []);
    }

    for (const model of models) {
      const providerGroup = result.get(model.provider);
      if (providerGroup) {
        providerGroup.push(model);
      }
    }

    // Sort models within each provider by display name
    for (const providerGroup of result.values()) {
      providerGroup.sort((a, b) => a.displayName.localeCompare(b.displayName));
    }

    return result;
  }, [models]);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createDialogInitial, setCreateDialogInitial] = useState<ProviderModelDraft | null>(null);
  const [activeBrowserProvider, setActiveBrowserProvider] = useState<Provider | null>(null);
  const [browserState, setBrowserState] = useState<Record<Provider, ProviderBrowserState>>(() => ({
    [Provider.REPLICATE]: {
      loading: false,
      loadingMore: false,
      loaded: false,
      error: null,
      models: [],
      cursor: null,
      hasMore: false,
      searchQuery: "",
      jobTypeFilter: "ALL",
      sortBy: "popularity",
      fetchedAll: false,
      totalFetched: 0,
      timeoutOccurred: false,
      pagesFetched: 0,
    },
    [Provider.GEMINI]: {
      loading: false,
      loadingMore: false,
      loaded: false,
      error: null,
      models: [],
      cursor: null,
      hasMore: false,
      searchQuery: "",
      jobTypeFilter: "ALL",
      sortBy: "popularity",
      fetchedAll: false,
      totalFetched: 0,
      timeoutOccurred: false,
      pagesFetched: 0,
    },
    [Provider.OPENAI]: {
      loading: false,
      loadingMore: false,
      loaded: false,
      error: null,
      models: [],
      cursor: null,
      hasMore: false,
      searchQuery: "",
      jobTypeFilter: "ALL",
      sortBy: "popularity",
      fetchedAll: false,
      totalFetched: 0,
      timeoutOccurred: false,
      pagesFetched: 0,
    },
    [Provider.FAL]: {
      loading: false,
      loadingMore: false,
      loaded: false,
      error: null,
      models: [],
      cursor: null,
      hasMore: false,
      searchQuery: "",
      jobTypeFilter: "ALL",
      sortBy: "popularity",
      fetchedAll: false,
      totalFetched: 0,
      timeoutOccurred: false,
      pagesFetched: 0,
    },
  }));

  const openCreateDialog = (initial?: ProviderModelDraft) => {
    setCreateDialogInitial(
      initial ?? {
        provider: Provider.REPLICATE,
        jobTypes: [JobType.CREATE_IMAGE],
      },
    );
    setCreateDialogOpen(true);
  };

  const closeCreateDialog = (open: boolean) => {
    setCreateDialogOpen(open);
    if (!open) {
      setCreateDialogInitial(null);
    }
  };

  const fetchCatalog = useCallback(
    async (provider: Provider, options?: { append?: boolean; fetchAll?: boolean }) => {
      const currentState = browserState[provider];
      const isLoadingMore = options?.append ?? false;
      const fetchAllModels = options?.fetchAll ?? false;

      setBrowserState((prev) => ({
        ...prev,
        [provider]: {
          ...prev[provider],
          loading: !isLoadingMore,
          loadingMore: isLoadingMore,
          error: null,
        },
      }));

      try {
        const route = providerFetchRoutes[provider];
        const url = new URL(route, window.location.origin);

        // Add search query if present
        if (currentState.searchQuery) {
          url.searchParams.set("query", currentState.searchQuery);
        }

        // Add job type filter if not ALL
        if (currentState.jobTypeFilter !== "ALL") {
          url.searchParams.set("jobType", currentState.jobTypeFilter);
        }

        // Note: sortBy is now handled client-side, not sent to API

        // Add fetchAll parameter
        if (fetchAllModels) {
          url.searchParams.set("fetchAll", "true");
        }

        // Add cursor for pagination if loading more (but not when fetching all)
        if (isLoadingMore && currentState.cursor && !fetchAllModels) {
          url.searchParams.set("cursor", currentState.cursor);
        }

        const res = await fetch(url.toString(), { cache: "no-store" });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: res.statusText }));
          const message = body.error ?? res.statusText;
          throw new Error(message);
        }

        const body = await res.json();
        const newModels = Array.isArray(body?.models)
          ? body.models
              .map((model: Record<string, unknown>) => normalizeSuggestion(provider, model))
              .filter((model: ProviderModelSuggestion) => model.slug.length > 0)
          : [];

        const nextCursor = typeof body?.nextCursor === "string" ? body.nextCursor : null;
        const hasMore = body?.hasMore === true;
        const fetchedAll = body?.fetchedAll === true;
        const totalFetched = typeof body?.totalFetched === "number" ? body.totalFetched : newModels.length;
        const timeoutOccurred = body?.timeoutOccurred === true;
        const pagesFetched = typeof body?.pagesFetched === "number" ? body.pagesFetched : 0;

        // Cache to localStorage if fetchAll was successful (persistent 1-day cache)
        // Also cache if we got a good number of models even with timeout
        if ((fetchedAll || (timeoutOccurred && newModels.length > 500)) && newModels.length > 0) {
          try {
            const cacheKey = `replicate-models-${provider}`;
            localStorage.setItem(
              cacheKey,
              JSON.stringify({
                models: newModels,
                timestamp: Date.now(),
                totalFetched,
                timeoutOccurred,
                pagesFetched,
              })
            );
          } catch (e) {
            // Ignore storage errors (quota exceeded, etc.)
            console.warn("Failed to cache models:", e);
          }
        }

        setBrowserState((prev) => ({
          ...prev,
          [provider]: {
            ...prev[provider],
            loading: false,
            loadingMore: false,
            loaded: true,
            error: null,
            models: isLoadingMore ? [...prev[provider].models, ...newModels] : newModels,
            cursor: nextCursor,
            hasMore,
            fetchedAll: fetchedAll || prev[provider].fetchedAll,
            totalFetched,
            timeoutOccurred,
            pagesFetched,
          },
        }));
      } catch (error) {
        setBrowserState((prev) => ({
          ...prev,
          [provider]: {
            ...prev[provider],
            loading: false,
            loadingMore: false,
            error: error instanceof Error ? error.message : "Unable to fetch models right now.",
          },
        }));
      }
    },
    [browserState]
  );

  const updateSearchQuery = useCallback((provider: Provider, query: string) => {
    setBrowserState((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        searchQuery: query,
        cursor: null,
        models: [],
      },
    }));
  }, []);

  const updateJobTypeFilter = useCallback((provider: Provider, filter: JobType | "ALL") => {
    setBrowserState((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        jobTypeFilter: filter,
        cursor: null,
        models: [],
      },
    }));
  }, []);

  const updateSortBy = useCallback((provider: Provider, sortBy: SortOption) => {
    setBrowserState((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        sortBy,
        // Don't reset models or cursor - sorting is client-side
      },
    }));
  }, []);

  const lookupModelBySlug = useCallback(
    async (provider: Provider, slugInput: string) => {
      const slug = slugInput.trim();
      if (!slug) {
        throw new Error("Enter a provider/model slug.");
      }

      const route = providerFetchRoutes[provider];
      const res = await fetch(`${route}?slug=${encodeURIComponent(slug)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? res.statusText);
      }

      const body = await res.json();
      if (!body?.model || typeof body.model !== "object") {
        throw new Error("No model details returned for that slug.");
      }

      const suggestion = normalizeSuggestion(provider, body.model as Record<string, unknown>);

      setBrowserState((prev) => {
        const current = prev[provider];
        const filtered = current.models.filter((item) => item.slug !== suggestion.slug);
        return {
          ...prev,
          [provider]: {
            ...prev[provider],
            loading: false,
            loaded: true,
            error: null,
            models: [suggestion, ...filtered],
          },
        };
      });

      return suggestion;
    },
    [],
  );

  // Try to load from cache first - use localStorage for persistent 1-day cache
  const loadFromCache = useCallback((provider: Provider) => {
    try {
      const cacheKey = `replicate-models-${provider}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        // Check if cache is older than 1 day (24 hours)
        const cacheAge = Date.now() - (parsed.timestamp || 0);
        const oneDayMs = 24 * 60 * 60 * 1000; // 1 day in milliseconds

        // Use cache if less than 1 day old
        if (cacheAge < oneDayMs && Array.isArray(parsed.models) && parsed.models.length > 0) {
          setBrowserState((prev) => ({
            ...prev,
            [provider]: {
              ...prev[provider],
              models: parsed.models,
              loaded: true,
              fetchedAll: true,
              totalFetched: parsed.totalFetched || parsed.models.length,
              hasMore: false,
              timeoutOccurred: parsed.timeoutOccurred || false,
              pagesFetched: parsed.pagesFetched || 0,
            },
          }));
          return true;
        } else if (cacheAge >= oneDayMs) {
          // Cache is stale, remove it
          localStorage.removeItem(cacheKey);
        }
      }
    } catch (e) {
      // Ignore cache errors
      console.warn("Failed to load from cache:", e);
    }
    return false;
  }, []);

  useEffect(() => {
    if (!activeBrowserProvider) {
      return;
    }
    const state = browserState[activeBrowserProvider];
    // Only auto-fetch if nothing is loaded and not currently loading
    if (!state.loaded && !state.loading && state.models.length === 0) {
      // Try cache first
      const loadedFromCache = loadFromCache(activeBrowserProvider);
      // Only fetch initial page if no cache exists
      if (!loadedFromCache) {
        void fetchCatalog(activeBrowserProvider);
      }
    }
  }, [activeBrowserProvider, browserState, fetchCatalog, loadFromCache]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Model catalog</h3>
          <p className="text-sm text-muted-foreground">
            Manage which vendor models the studio exposes and how many credits each run costs.
          </p>
        </div>
        <Button onClick={() => openCreateDialog()}>Add provider model</Button>
      </div>

      {providerOrder.map((provider) => {
        const providerModels = groupedByProvider.get(provider) ?? [];

        return (
          <Card key={provider}>
            <CardHeader className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>{providerLabels[provider]}</CardTitle>
                <CardDescription>
                  {providerModels.length} model{providerModels.length === 1 ? "" : "s"} configured for this provider.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveBrowserProvider(provider)}
                >
                  Browse {providerLabels[provider]}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[240px]">Model</TableHead>
                    <TableHead className="w-[100px]">Job Types</TableHead>
                    <TableHead className="w-[140px]">Pricing</TableHead>
                    <TableHead className="w-[60px]">Active</TableHead>
                    <TableHead className="w-[80px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {providerModels.length ? (
                    providerModels.map((model) => (
                      <ProviderModelRow key={model.id} model={model} />
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-sm text-muted-foreground">
                        No models configured yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}

      <CreateProviderModelDialog
        open={createDialogOpen}
        onOpenChange={closeCreateDialog}
        initialModel={createDialogInitial}
      />

      {activeBrowserProvider ? (
        <ProviderModelBrowseDialog
          provider={activeBrowserProvider}
          state={browserState[activeBrowserProvider]}
          open={Boolean(activeBrowserProvider)}
          onClose={() => setActiveBrowserProvider(null)}
          onRefresh={() => {
            // Clear cache and refetch fresh data
            const cacheKey = `replicate-models-${activeBrowserProvider}`;
            try {
              localStorage.removeItem(cacheKey);
            } catch {
              // Ignore storage errors
            }
            setBrowserState((prev) => ({
              ...prev,
              [activeBrowserProvider]: {
                ...prev[activeBrowserProvider],
                models: [],
                cursor: null,
                fetchedAll: false,
                totalFetched: 0,
                hasMore: false,
                loaded: false,
              },
            }));
            void fetchCatalog(activeBrowserProvider);
          }}
          onFetchAll={() => fetchCatalog(activeBrowserProvider, { fetchAll: true })}
          onLoadMore={() => fetchCatalog(activeBrowserProvider, { append: true })}
          onSearchQueryChange={(query) => updateSearchQuery(activeBrowserProvider, query)}
          onJobTypeFilterChange={(filter) => updateJobTypeFilter(activeBrowserProvider, filter)}
          onSortByChange={(sortBy) => updateSortBy(activeBrowserProvider, sortBy)}
          onImport={(suggestion) => {
            openCreateDialog({
              provider: suggestion.provider,
              jobTypes: [suggestion.defaultJobType],
              displayName: suggestion.displayName,
              description: suggestion.description,
              slug: suggestion.slug,
              creditCost: suggestion.suggestedCreditCost ?? undefined,
              suggestedCreditCost: suggestion.suggestedCreditCost ?? null,
              metadata: suggestion.metadata ?? undefined,
            });
            setActiveBrowserProvider(null);
          }}
          supportsLookup={activeBrowserProvider === Provider.REPLICATE}
          onLookup={(slug) => lookupModelBySlug(activeBrowserProvider, slug)}
        />
      ) : null}
    </section>
  );
}

type ProviderModelRowProps = {
  model: ProviderModel;
};

function ProviderModelRow({ model }: ProviderModelRowProps) {
  const [displayName, setDisplayName] = useState(model.displayName);
  const [slug, setSlug] = useState(model.slug);
  const [creditCost, setCreditCost] = useState(model.creditCost.toString());
  const [isActive, setIsActive] = useState(model.isActive);
  const [isEditingModel, setIsEditingModel] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setDisplayName(model.displayName);
    setSlug(model.slug);
    setCreditCost(model.creditCost.toString());
    setIsActive(model.isActive);
  }, [model.displayName, model.slug, model.creditCost, model.isActive]);

  const handleResult = (result: ProviderModelActionResult, successMessage: string) => {
    if (result.ok) {
      setMessage(successMessage);
      setError(null);
      setIsEditingModel(false);
    } else {
      setError(result.message ?? "Something went wrong.");
      setMessage(null);
    }
  };

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateProviderModelAction({
        id: model.id,
        provider: model.provider,
        jobTypes: model.jobTypes,
        displayName,
        slug,
        creditCost,
      });
      handleResult(result, "Saved");
    });
  };

  const handleToggle = (checked: boolean) => {
    setIsActive(checked);
    startTransition(async () => {
      const result = await toggleProviderModelAction({
        id: model.id,
        isActive: checked,
      });
      if (!result.ok) {
        setIsActive(!checked);
        setError(result.message ?? "Unable to update status.");
        setMessage(null);
      } else {
        setMessage(checked ? "Enabled" : "Disabled");
        setError(null);
      }
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteProviderModelAction({ id: model.id });
      handleResult(result, "Removed");
    });
  };

  // Calculate pricing and margin
  const pricing = extractPricing(
    model.metadata && typeof model.metadata === "object"
      ? (model.metadata as Record<string, unknown>)
      : null
  );

  const getMarginBadge = () => {
    if (!pricing) return null;

    let marginPercent = 0;
    const creditCostUSD = model.creditCost * 0.01;

    if (pricing.type === "single") {
      const margin = creditCostUSD - pricing.unitPrice;
      marginPercent = (margin / pricing.unitPrice) * 100;
    } else if (pricing.type === "tiered") {
      const prices = pricing.tiers.map((t) => t.unitPriceUSD);
      const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
      const margin = creditCostUSD - avgPrice;
      marginPercent = (margin / avgPrice) * 100;
    }

    const badgeColor =
      marginPercent >= 20
        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
        : marginPercent >= 10
        ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
        : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";

    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badgeColor}`}>
        {marginPercent.toFixed(0)}%
      </span>
    );
  };

  const pricingSummary = formatPricingSummary(pricing);

  return (
    <TableRow className="group hover:bg-muted/30">
      {/* Model Column */}
      <TableCell className="py-2">
        {isEditingModel ? (
          <div className="space-y-1">
            <Input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              disabled={pending}
              className="h-8 text-sm"
              placeholder="Display name"
            />
            <Input
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              disabled={pending}
              className="h-8 text-xs"
              placeholder="owner/model"
            />
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{displayName}</div>
              <div className="text-xs text-muted-foreground truncate">{slug}</div>
            </div>
            <button
              onClick={() => setIsEditingModel(true)}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded"
              title="Edit model name and slug"
            >
              <svg className="h-4 w-4 text-muted-foreground" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          </div>
        )}
      </TableCell>

      {/* Job Types Column */}
      <TableCell className="py-2">
        <div className="flex flex-wrap gap-1">
          {model.jobTypes.map((jobType) => (
            <Badge key={jobType} variant="secondary" className="text-xs px-1.5 py-0">
              {jobType === JobType.CREATE_IMAGE ? "IMG" : jobType === JobType.EDIT_IMAGE ? "EDIT" : "VID"}
            </Badge>
          ))}
        </div>
      </TableCell>

      {/* Pricing Column */}
      <TableCell className="py-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <Input
              value={creditCost}
              onChange={(event) => {
                setCreditCost(event.target.value.replace(/[^0-9]/g, ""));
                setMessage(null);
                setError(null);
              }}
              inputMode="numeric"
              disabled={pending}
              className="h-7 w-16 text-sm font-medium"
            />
            <span className="text-xs text-muted-foreground">cr</span>
          </div>
          {pricingSummary ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{pricingSummary}</span>
              {getMarginBadge()}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">No pricing</span>
          )}
        </div>
      </TableCell>

      {/* Active Column */}
      <TableCell className="py-2">
        <Switch checked={isActive} onCheckedChange={handleToggle} disabled={pending} />
      </TableCell>

      {/* Actions Column */}
      <TableCell className="py-2">
        <div className="flex items-center justify-end gap-1">
          {error ? (
            <span className="text-xs text-destructive mr-2">{error}</span>
          ) : message ? (
            <span className="text-xs text-muted-foreground mr-2">{message}</span>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            disabled={pending}
            className="h-8 w-8 p-0"
            title="Save changes"
          >
            <svg className="h-4 w-4" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
              <path d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={pending}
            className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
            title="Remove model"
          >
            <svg className="h-4 w-4" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
              <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

type ProviderModelBrowseDialogProps = {
  provider: Provider;
  state: ProviderBrowserState;
  open: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onFetchAll: () => void;
  onLoadMore: () => void;
  onSearchQueryChange: (query: string) => void;
  onJobTypeFilterChange: (filter: JobType | "ALL") => void;
  onSortByChange: (sortBy: SortOption) => void;
  onImport: (model: ProviderModelSuggestion) => void;
  supportsLookup?: boolean;
  onLookup?: (slug: string) => Promise<unknown>;
};

function ProviderModelBrowseDialog({
  provider,
  state,
  open,
  onClose,
  onRefresh,
  onFetchAll,
  onLoadMore,
  onSearchQueryChange,
  onJobTypeFilterChange,
  onSortByChange,
  onImport,
  supportsLookup = false,
  onLookup,
}: ProviderModelBrowseDialogProps) {
  const [slugQuery, setSlugQuery] = useState("");
  const [localSearchQuery, setLocalSearchQuery] = useState(state.searchQuery);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupPending, startLookupTransition] = useTransition();

  // Client-side sorting of models
  const sortedModels = useMemo(() => {
    const models = [...state.models];

    switch (state.sortBy) {
      case "popularity": {
        // Most popular first (highest run count)
        return models.sort((a, b) => {
          const aRuns =
            a.metadata && typeof a.metadata === "object"
              ? ((a.metadata as { runCount?: number }).runCount ?? 0)
              : 0;
          const bRuns =
            b.metadata && typeof b.metadata === "object"
              ? ((b.metadata as { runCount?: number }).runCount ?? 0)
              : 0;
          return bRuns - aRuns;
        });
      }
      case "name-asc": {
        // Alphabetical A-Z
        return models.sort((a, b) => a.displayName.localeCompare(b.displayName));
      }
      case "name-desc": {
        // Alphabetical Z-A
        return models.sort((a, b) => b.displayName.localeCompare(a.displayName));
      }
      case "recent": {
        // Most recently created first (using latestVersionId as proxy)
        return models.sort((a, b) => {
          const aDate =
            a.metadata && typeof a.metadata === "object"
              ? ((a.metadata as { latestVersionId?: string }).latestVersionId ?? "")
              : "";
          const bDate =
            b.metadata && typeof b.metadata === "object"
              ? ((b.metadata as { latestVersionId?: string }).latestVersionId ?? "")
              : "";
          return bDate.localeCompare(aDate);
        });
      }
      default:
        return models;
    }
  }, [state.models, state.sortBy]);

  // Debounce search query (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearchQuery !== state.searchQuery) {
        onSearchQueryChange(localSearchQuery);
        onRefresh();
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [localSearchQuery, state.searchQuery, onSearchQueryChange, onRefresh]);

  // Sync local state with global state when dialog opens
  useEffect(() => {
    if (open) {
      setLocalSearchQuery(state.searchQuery);
    }
  }, [open, state.searchQuery]);

  const handleLookup = () => {
    if (!supportsLookup || !onLookup) {
      return;
    }

    setLookupError(null);
    setLookupMessage(null);

    const trimmed = slugQuery.trim();
    if (!trimmed) {
      setLookupError("Enter a provider/model slug.");
      return;
    }

    startLookupTransition(async () => {
      try {
        await onLookup(trimmed);
        setLookupMessage("Model added to the list below.");
        setSlugQuery("");
      } catch (error) {
        setLookupError(error instanceof Error ? error.message : "Unable to find that model.");
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Browse {providerLabels[provider]} models</DialogTitle>
          <DialogDescription>
            Fetch the latest models from {providerLabels[provider]} and import them into your
            catalog with one click.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {supportsLookup ? (
            <div className="space-y-2 rounded-md border border-dashed p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder="owner/model (e.g. google/nano-banana)"
                  value={slugQuery}
                  onChange={(event) => setSlugQuery(event.target.value)}
                  className="max-w-sm"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleLookup}
                  disabled={lookupPending || !slugQuery.trim()}
                >
                  {lookupPending ? "Looking up…" : "Find model"}
                </Button>
              </div>
              {lookupMessage ? (
                <p className="text-xs text-foreground">{lookupMessage}</p>
              ) : null}
              {lookupError ? (
                <p className="text-xs text-destructive">{lookupError}</p>
              ) : null}
            </div>
          ) : null}

          {/* Search and Filter Controls */}
          <div className="space-y-3">
            <Input
              placeholder="Search models by name, slug, or description..."
              value={localSearchQuery}
              onChange={(event) => setLocalSearchQuery(event.target.value)}
              className="w-full"
            />
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">Filter:</span>
                <Select
                  value={state.jobTypeFilter}
                  onValueChange={(value: JobType | "ALL") => {
                    onJobTypeFilterChange(value);
                    onRefresh();
                  }}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All types</SelectItem>
                    {jobTypeOrder.map((jobType) => (
                      <SelectItem key={jobType} value={jobType}>
                        {jobTypeLabels[jobType]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">Sort by:</span>
                <Select
                  value={state.sortBy}
                  onValueChange={(value: SortOption) => {
                    onSortByChange(value);
                    // Don't refetch - sorting is client-side
                  }}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="popularity">Most popular</SelectItem>
                    <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                    <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                    <SelectItem value="recent">Most recent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Status Line */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex-1">
              {state.error ? (
                <p className="text-sm text-destructive">{state.error}</p>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">
                    {sortedModels.length} model{sortedModels.length === 1 ? "" : "s"}
                    {state.searchQuery || state.jobTypeFilter !== "ALL" ? " found" : " loaded"}
                    {state.timeoutOccurred && sortedModels.length > 500 ? (
                      <span className="ml-1 text-yellow-600 dark:text-yellow-400">
                        (Partial - {state.pagesFetched} pages fetched, timeout occurred)
                      </span>
                    ) : state.fetchedAll ? (
                      <span className="ml-1 text-green-600 dark:text-green-400">
                        (All models fetched - {state.pagesFetched} pages)
                      </span>
                    ) : state.hasMore ? (
                      <span> • More available</span>
                    ) : null}
                  </p>
                  {state.loading && (
                    <p className="text-xs text-muted-foreground">
                      Fetching from Replicate... This may take 20-40 seconds for all models.
                    </p>
                  )}
                  {state.timeoutOccurred && (
                    <p className="text-xs text-yellow-600 dark:text-yellow-400">
                      Timeout occurred after {state.pagesFetched} pages. Click Refresh and Fetch All again for more models.
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!state.fetchedAll && !state.loading && (
                <Button variant="default" size="sm" onClick={onFetchAll} disabled={state.loading}>
                  Fetch All Models
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={onRefresh} disabled={state.loading}>
                {state.loading ? "Refreshing…" : "Refresh"}
              </Button>
            </div>
          </div>

          {/* Model List */}
          <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
            {state.loading && sortedModels.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                Fetching catalog from {providerLabels[provider]}…
              </div>
            ) : null}
            {!state.loading && sortedModels.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                No models found. Try adjusting your search or filters.
              </div>
            ) : null}
            {sortedModels.map((model) => {
              const pricingDetails = extractPricing(model.metadata ?? null);
              const pricingSummary = formatPricingSummary(pricingDetails);
              const runCount =
                model.metadata && typeof model.metadata === "object"
                  ? (model.metadata as { runCount?: number }).runCount
                  : null;

              return (
                <div
                  key={`${model.provider}-${model.slug}`}
                  className="rounded-lg border bg-card p-3 shadow-sm hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-foreground">{model.displayName}</p>
                        <Badge variant="secondary" className="text-xs px-1.5 py-0">
                          {model.defaultJobType === JobType.CREATE_IMAGE
                            ? "IMG"
                            : model.defaultJobType === JobType.EDIT_IMAGE
                            ? "EDIT"
                            : "VID"}
                        </Badge>
                        {typeof runCount === "number" ? (
                          <span className="text-xs text-muted-foreground">
                            {runCount.toLocaleString()} runs
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{model.slug}</p>
                      {model.description ? (
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                          {model.description}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {pricingSummary ? <span>{pricingSummary}</span> : null}
                        {typeof model.suggestedCreditCost === "number" ? (
                          <span>• {model.suggestedCreditCost} cr</span>
                        ) : null}
                      </div>
                    </div>
                    <Button size="sm" onClick={() => onImport(model)} className="shrink-0">
                      Import
                    </Button>
                  </div>
                </div>
              );
            })}
            {state.hasMore && !state.loading && !state.fetchedAll ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={onLoadMore}
                disabled={state.loadingMore}
              >
                {state.loadingMore ? "Loading more…" : "Load more models"}
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type CreateProviderModelDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialModel: ProviderModelDraft | null;
};

function CreateProviderModelDialog({
  open,
  onOpenChange,
  initialModel,
}: CreateProviderModelDialogProps) {
  const [provider, setProvider] = useState<Provider>(Provider.REPLICATE);
  const [jobTypes, setJobTypes] = useState<JobType[]>([JobType.CREATE_IMAGE]);
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [creditCost, setCreditCost] = useState("10");
  const [metadata, setMetadata] = useState("");
  const [suggestedCreditCost, setSuggestedCreditCost] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) {
      return;
    }

    setProvider(initialModel?.provider ?? Provider.REPLICATE);
    setJobTypes(initialModel?.jobTypes ?? [JobType.CREATE_IMAGE]);
    setDisplayName(initialModel?.displayName ?? "");
    setDescription(initialModel?.description ?? "");
    setSlug(initialModel?.slug ?? "");
    const fallbackCredits = initialModel?.creditCost ?? initialModel?.suggestedCreditCost ?? 10;
    setCreditCost(String(fallbackCredits));
    setMetadata(
      initialModel?.metadata ? JSON.stringify(initialModel.metadata, null, 2) : "",
    );
    setSuggestedCreditCost(initialModel?.suggestedCreditCost ?? null);
    setError(null);
  }, [open, initialModel]);

  const toggleJobType = (jobType: JobType) => {
    setJobTypes((prev) => {
      if (prev.includes(jobType)) {
        return prev.filter((t) => t !== jobType);
      }
      return [...prev, jobType];
    });
    setError(null);
  };

  const handleCreate = () => {
    if (jobTypes.length === 0) {
      setError("Select at least one job type.");
      return;
    }

    startTransition(async () => {
      const result = await createProviderModelAction({
        provider,
        jobTypes,
        displayName,
        description,
        slug,
        creditCost,
        metadata,
      });

      if (result.ok) {
        onOpenChange(false);
      } else {
        setError(result.message ?? "Unable to create provider model.");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initialModel ? "Add provider model" : "Add provider model"}</DialogTitle>
          <DialogDescription>
            Choose the vendor, workflow, and number of credits to deduct for each request.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="provider">Provider</Label>
            <Select value={provider} onValueChange={(value: Provider) => setProvider(value)}>
              <SelectTrigger id="provider">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {providerOrder.map((value) => (
                  <SelectItem key={value} value={value}>
                    {providerLabels[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Job Types (select at least one)</Label>
            <div className="flex flex-col gap-2">
              {jobTypeOrder.map((jobType) => (
                <label
                  key={jobType}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={jobTypes.includes(jobType)}
                    onChange={() => toggleJobType(jobType)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span>{jobTypeLabels[jobType]}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="e.g. SDXL 1.0"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Brief description of what this model does"
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">Model slug</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder="owner/model or API slug"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="creditCost">Credits per run</Label>
            <Input
              id="creditCost"
              value={creditCost}
              onChange={(event) => setCreditCost(event.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
            />
            {typeof suggestedCreditCost === "number" ? (
              <p className="text-xs text-muted-foreground">
                Suggested: {suggestedCreditCost} credits based on provider pricing.
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="metadata">Metadata (optional JSON)</Label>
            <Textarea
              id="metadata"
              value={metadata}
              onChange={(event) => setMetadata(event.target.value)}
              placeholder='{"size":"1024x1024"}'
              rows={6}
              className="max-h-[200px] resize-none font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Auto-populated when importing. Edit only if needed.
            </p>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button onClick={handleCreate} disabled={pending}>
            Save model
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
