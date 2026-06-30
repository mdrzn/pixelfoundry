# Schema-Driven Dynamic Form Implementation Plan

> **For Claude:** Use `${SUPERPOWERS_SKILLS_ROOT}/skills/collaboration/executing-plans/SKILL.md` to implement this plan task-by-task.

**Goal:** Make the Create Image form dynamically adapt to each model's capabilities by fetching and parsing OpenAPI schemas from Replicate, showing/hiding/disabling form sections based on what each model supports.

**Architecture:** Fetch `openapi_schema` from Replicate when importing models and store in database. Parse schemas on-demand to extract capabilities (e.g., supports reference images, negative prompt). Form uses React hook to fetch capabilities and conditionally renders sections. Sections that aren't supported are collapsed and greyed out.

**Tech Stack:** Next.js 15, React Server Components, Prisma, TypeScript, Replicate API

---

## Task 1: Fetch and Store OpenAPI Schemas

**Goal:** Update Replicate models API to fetch and store `openapi_schema` when importing models.

**Files:**
- Modify: `src/app/api/admin/replicate-models/route.ts`

**Step 1: Update type definition for Replicate API model**

In `route.ts`, update the `ReplicateAPIModel` type to include `openapi_schema`:

```typescript
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
```

**Step 2: Store openapi_schema in metadata**

In the `buildModelResponse` function (around line 163), add `openapi_schema` to metadata:

```typescript
function buildModelResponse(slug: string, model: ReplicateAPIModel) {
  const displayName = model?.name ?? model?.owner ?? slug;
  const pricing = model?.latest_version?.pricing ?? null;
  const unitPrice = parseNumber(pricing?.unit_price);
  const currency = pricing?.currency ?? "USD";
  const unitType = pricing?.unit_type ?? null;
  const suggestedCreditCost = estimateCreditCost(unitPrice);

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
      openapi_schema: model?.latest_version?.openapi_schema ?? null,
      pricing: {
        unitPriceUSD: unitPrice,
        unitType,
        currency,
      },
    },
  };
}
```

**Step 3: Test the API**

Run the dev server and test importing a model via admin panel:

```bash
npm run dev
```

1. Open http://localhost:6116/dashboard/admin
2. Go to Providers → Replicate → Browse Replicate
3. Search for `tencent/hunyuan-image-3`
4. Click "Import model"
5. Use Prisma Studio to verify `metadata.openapi_schema` is populated:

```bash
npx prisma studio
```

Expected: `ProviderModel` record has `metadata.openapi_schema` with Input/Output schema

**Step 4: Commit**

```bash
git add src/app/api/admin/replicate-models/route.ts
git commit -m "feat: fetch and store openapi_schema for Replicate models"
```

---

## Task 2: Create Model Capabilities Parser

**Goal:** Create utility that parses OpenAPI schemas to extract model capabilities.

**Files:**
- Create: `src/lib/model-capabilities.ts`
- Create: `src/lib/__tests__/model-capabilities.test.ts`

**Step 1: Write failing tests**

Create test file:

```typescript
import { describe, it, expect } from "vitest";
import { parseModelCapabilities } from "../model-capabilities";

describe("parseModelCapabilities", () => {
  it("should detect reference images support from image input field", () => {
    const schema = {
      components: {
        schemas: {
          Input: {
            type: "object",
            properties: {
              prompt: { type: "string" },
              image: { type: "string", format: "uri" },
            },
          },
        },
      },
    };

    const capabilities = parseModelCapabilities(schema);

    expect(capabilities.supportsReferenceImages).toBe(true);
    expect(capabilities.imageInputField).toEqual({
      name: "image",
      acceptsMultiple: false,
    });
  });

  it("should detect multiple reference images from array input", () => {
    const schema = {
      components: {
        schemas: {
          Input: {
            type: "object",
            properties: {
              prompt: { type: "string" },
              reference_images: {
                type: "array",
                items: { type: "string", format: "uri" },
              },
            },
          },
        },
      },
    };

    const capabilities = parseModelCapabilities(schema);

    expect(capabilities.supportsReferenceImages).toBe(true);
    expect(capabilities.imageInputField).toEqual({
      name: "reference_images",
      acceptsMultiple: true,
    });
  });

  it("should detect negative prompt support", () => {
    const schema = {
      components: {
        schemas: {
          Input: {
            type: "object",
            properties: {
              prompt: { type: "string" },
              negative_prompt: { type: "string" },
            },
          },
        },
      },
    };

    const capabilities = parseModelCapabilities(schema);

    expect(capabilities.supportsNegativePrompt).toBe(true);
  });

  it("should handle missing schema gracefully", () => {
    const capabilities = parseModelCapabilities(null);

    expect(capabilities.supportsReferenceImages).toBe(false);
    expect(capabilities.supportsNegativePrompt).toBe(false);
    expect(capabilities.imageInputField).toBe(null);
  });

  it("should detect text-only models", () => {
    const schema = {
      components: {
        schemas: {
          Input: {
            type: "object",
            properties: {
              prompt: { type: "string" },
              width: { type: "integer" },
              height: { type: "integer" },
            },
          },
        },
      },
    };

    const capabilities = parseModelCapabilities(schema);

    expect(capabilities.supportsReferenceImages).toBe(false);
    expect(capabilities.imageInputField).toBe(null);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test src/lib/__tests__/model-capabilities.test.ts
```

Expected: All tests FAIL with "Cannot find module '../model-capabilities'"

**Step 3: Implement the capabilities parser**

Create `src/lib/model-capabilities.ts`:

```typescript
export type ModelCapabilities = {
  supportsReferenceImages: boolean;
  supportsNegativePrompt: boolean;
  imageInputField: {
    name: string;
    acceptsMultiple: boolean;
  } | null;
  acceptedParams: string[];
};

type OpenAPISchema = {
  components?: {
    schemas?: {
      Input?: {
        type?: string;
        properties?: Record<string, unknown>;
      };
    };
  };
};

const IMAGE_INPUT_FIELD_NAMES = [
  "image",
  "input_image",
  "reference_images",
  "reference_image",
  "source_image",
  "style_image",
  "control_image",
];

export function parseModelCapabilities(schema: unknown): ModelCapabilities {
  const defaultCapabilities: ModelCapabilities = {
    supportsReferenceImages: false,
    supportsNegativePrompt: false,
    imageInputField: null,
    acceptedParams: [],
  };

  if (!schema || typeof schema !== "object") {
    return defaultCapabilities;
  }

  const openAPISchema = schema as OpenAPISchema;
  const inputProperties = openAPISchema?.components?.schemas?.Input?.properties;

  if (!inputProperties || typeof inputProperties !== "object") {
    return defaultCapabilities;
  }

  const acceptedParams = Object.keys(inputProperties);

  // Detect reference images support
  let imageInputField: ModelCapabilities["imageInputField"] = null;

  for (const fieldName of IMAGE_INPUT_FIELD_NAMES) {
    const field = inputProperties[fieldName];

    if (!field || typeof field !== "object") {
      continue;
    }

    const fieldDef = field as Record<string, unknown>;

    // Check for array of URIs
    if (fieldDef.type === "array") {
      const items = fieldDef.items as Record<string, unknown> | undefined;
      if (items?.type === "string" || items?.format === "uri") {
        imageInputField = { name: fieldName, acceptsMultiple: true };
        break;
      }
    }

    // Check for single URI
    if (fieldDef.type === "string" && (fieldDef.format === "uri" || fieldName.includes("image"))) {
      imageInputField = { name: fieldName, acceptsMultiple: false };
      break;
    }
  }

  // Detect negative prompt support
  const supportsNegativePrompt = "negative_prompt" in inputProperties;

  return {
    supportsReferenceImages: imageInputField !== null,
    supportsNegativePrompt,
    imageInputField,
    acceptedParams,
  };
}
```

**Step 4: Run tests to verify they pass**

```bash
npm test src/lib/__tests__/model-capabilities.test.ts
```

Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add src/lib/model-capabilities.ts src/lib/__tests__/model-capabilities.test.ts
git commit -m "feat: add model capabilities parser"
```

---

## Task 3: Create Capabilities API Route

**Goal:** Create API endpoint that returns parsed capabilities for a model.

**Files:**
- Create: `src/app/api/models/[id]/capabilities/route.ts`

**Step 1: Create the API route**

Create file with full implementation:

```typescript
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { parseModelCapabilities } from "@/lib/model-capabilities";

export const revalidate = 3600; // Cache for 1 hour

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
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
```

**Step 2: Test the API endpoint**

Start the dev server and test:

```bash
npm run dev
```

Get a model ID from the database:
```bash
npx prisma studio
```

Test with curl (replace MODEL_ID):
```bash
curl http://localhost:6116/api/models/MODEL_ID/capabilities
```

Expected response:
```json
{
  "capabilities": {
    "supportsReferenceImages": true,
    "supportsNegativePrompt": true,
    "imageInputField": {
      "name": "image",
      "acceptsMultiple": false
    },
    "acceptedParams": ["prompt", "image", "negative_prompt", ...]
  }
}
```

**Step 3: Commit**

```bash
git add src/app/api/models/[id]/capabilities/route.ts
git commit -m "feat: add model capabilities API endpoint"
```

---

## Task 4: Create useModelCapabilities Hook

**Goal:** Create React hook for fetching model capabilities on the client.

**Files:**
- Create: `src/hooks/use-model-capabilities.ts`

**Step 1: Create the hook**

```typescript
"use client";

import { useEffect, useState } from "react";
import type { ModelCapabilities } from "@/lib/model-capabilities";

type UseModelCapabilitiesResult = {
  capabilities: ModelCapabilities | null;
  isLoading: boolean;
  error: string | null;
};

const DEFAULT_CAPABILITIES: ModelCapabilities = {
  supportsReferenceImages: true,
  supportsNegativePrompt: true,
  imageInputField: null,
  acceptedParams: [],
};

export function useModelCapabilities(
  modelId: string | undefined
): UseModelCapabilitiesResult {
  const [capabilities, setCapabilities] = useState<ModelCapabilities | null>(
    DEFAULT_CAPABILITIES
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!modelId) {
      setCapabilities(DEFAULT_CAPABILITIES);
      return;
    }

    let cancelled = false;

    const fetchCapabilities = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`/api/models/${modelId}/capabilities`, {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (cancelled) return;

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        setCapabilities(data.capabilities ?? DEFAULT_CAPABILITIES);
      } catch (err) {
        if (cancelled) return;

        console.error("Failed to fetch model capabilities:", err);
        setError(
          err instanceof Error ? err.message : "Failed to fetch capabilities"
        );
        // Fallback to showing all fields
        setCapabilities(DEFAULT_CAPABILITIES);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void fetchCapabilities();

    return () => {
      cancelled = true;
    };
  }, [modelId]);

  return { capabilities, isLoading, error };
}
```

**Step 2: Manually test the hook**

The hook will be tested in Task 6 when integrated into the form.

**Step 3: Commit**

```bash
git add src/hooks/use-model-capabilities.ts
git commit -m "feat: add useModelCapabilities hook"
```

---

## Task 5: Update CollapsibleSection with Disabled State

**Goal:** Add disabled state to CollapsibleSection component for unsupported features.

**Files:**
- Modify: `src/app/(dashboard)/dashboard/create-image/_components/collapsible-section.tsx`

**Step 1: Update component props and implementation**

Replace the entire file content:

```typescript
"use client";

import { useState } from "react";
import { ChevronDown, Lock } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";

type CollapsibleSectionProps = {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  summaryBadge?: string | null;
  icon?: React.ReactNode;
  children: React.ReactNode;
  disabled?: boolean;
  disabledMessage?: string;
};

export function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = false,
  summaryBadge,
  icon,
  children,
  disabled = false,
  disabledMessage = "Not supported by this model",
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // Don't allow opening if disabled
  const handleOpenChange = (open: boolean) => {
    if (!disabled) {
      setIsOpen(open);
    }
  };

  return (
    <Collapsible
      open={isOpen && !disabled}
      onOpenChange={handleOpenChange}
      className="space-y-3"
    >
      <CollapsibleTrigger
        className={cn(
          "group flex w-full items-center justify-between rounded-md border bg-card/50 px-4 py-3 text-left transition-colors",
          disabled
            ? "cursor-not-allowed opacity-50"
            : "hover:bg-accent/50"
        )}
        disabled={disabled}
      >
        <div className="flex items-center gap-3">
          {icon || (disabled && <Lock className="h-4 w-4 text-muted-foreground" />)}
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{title}</span>
              {summaryBadge && !isOpen ? (
                <Badge variant="secondary" className="text-xs">
                  {summaryBadge}
                </Badge>
              ) : null}
            </div>
            <span className="text-xs text-muted-foreground">
              {disabled ? disabledMessage : subtitle}
            </span>
          </div>
        </div>
        {!disabled && (
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-200",
              isOpen && "rotate-180"
            )}
          />
        )}
      </CollapsibleTrigger>
      {!disabled && (
        <CollapsibleContent className="space-y-4 rounded-md border bg-card p-4">
          {children}
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}
```

**Step 2: Test visually**

Start dev server and navigate to create-image page:

```bash
npm run dev
```

Temporarily add `disabled={true}` to a CollapsibleSection to verify styling.

Expected: Section appears greyed out with lock icon and cannot be opened.

**Step 3: Commit**

```bash
git add src/app/(dashboard)/dashboard/create-image/_components/collapsible-section.tsx
git commit -m "feat: add disabled state to CollapsibleSection"
```

---

## Task 6: Integrate Capabilities into Create Image Form

**Goal:** Update the Create Image form to use model capabilities and conditionally render sections.

**Files:**
- Modify: `src/app/(dashboard)/dashboard/create-image/create-image-form.tsx`

**Step 1: Import the hook at the top of the file**

Add to imports section (around line 1-15):

```typescript
import { useModelCapabilities } from "@/hooks/use-model-capabilities";
```

**Step 2: Add capabilities hook to component**

Inside the `CreateImageForm` component, after the existing hooks (around line 180):

```typescript
// Fetch model capabilities
const { capabilities, isLoading: capabilitiesLoading } = useModelCapabilities(
  providerModelId
);
```

**Step 3: Update Reference Images section**

Find the Reference Images CollapsibleSection (around line 683) and add disabled props:

```typescript
<CollapsibleSection
  title="Reference Images"
  subtitle="Upload or select images to guide the generation"
  icon={<ImageIcon className="h-4 w-4" />}
  defaultOpen={false}
  disabled={!capabilities?.supportsReferenceImages}
  disabledMessage="This model doesn't support reference images"
>
```

**Step 4: Update Negative Prompt section**

Find the Negative Prompt CollapsibleSection (around line 630) and add disabled props:

```typescript
<CollapsibleSection
  title="Negative Prompt"
  subtitle="Specify elements to avoid in generation"
  defaultOpen={false}
  disabled={!capabilities?.supportsNegativePrompt}
  disabledMessage="This model doesn't support negative prompts"
>
```

**Step 5: Add loading state banner**

Add a loading banner at the top of the form (after the form tag, around line 565):

```typescript
{capabilitiesLoading && (
  <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
    Loading model capabilities...
  </div>
)}
```

**Step 6: Test the full integration**

```bash
npm run dev
```

1. Navigate to http://localhost:6116/dashboard/create-image
2. Select "hunyuan-image-3" model
3. Verify Reference Images section is greyed out and collapsed
4. Select "flux-kontext-apps/professional-headshot" model
5. Verify Reference Images section becomes active and can be opened
6. Upload an image when on compatible model
7. Switch back to "hunyuan-image-3"
8. Verify section greys out but uploaded images remain in state
9. Switch back to compatible model
10. Verify section becomes active again with images still there

Expected: Form dynamically adapts to model capabilities without losing state.

**Step 7: Commit**

```bash
git add src/app/(dashboard)/dashboard/create-image/create-image-form.tsx
git commit -m "feat: integrate model capabilities into create image form"
```

---

## Task 7: Add Refresh Schemas to Admin Panel

**Goal:** Add ability to refresh model schemas in the admin panel.

**Files:**
- Create: `src/server/actions/refresh-model-schemas.ts`
- Modify: `src/app/(dashboard)/dashboard/admin/actions.ts`

**Step 1: Create server action for refreshing a single model schema**

Create new file `src/server/actions/refresh-model-schemas.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { Provider } from "@prisma/client";

import { getProviderCredentialSecret, requireAdminUser } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

const REPLICATE_API_BASE = "https://api.replicate.com/v1";

type ReplicateModelDetail = {
  owner?: string | null;
  name?: string | null;
  latest_version?: {
    openapi_schema?: unknown;
  } | null;
};

export async function refreshModelSchema(modelId: string) {
  await requireAdminUser();

  try {
    const model = await prisma.providerModel.findUnique({
      where: { id: modelId },
      select: { provider: true, slug: true, metadata: true },
    });

    if (!model) {
      return { ok: false, error: "Model not found" };
    }

    if (model.provider !== Provider.REPLICATE) {
      return {
        ok: false,
        error: "Schema refresh is only supported for Replicate models",
      };
    }

    const credential = await getProviderCredentialSecret(Provider.REPLICATE);

    const response = await fetch(
      `${REPLICATE_API_BASE}/models/${model.slug}`,
      {
        headers: {
          Authorization: `Bearer ${credential.apiKey}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      return {
        ok: false,
        error: `Replicate API error: ${response.status}`,
      };
    }

    const data = (await response.json()) as ReplicateModelDetail;
    const openapi_schema = data?.latest_version?.openapi_schema ?? null;

    const currentMetadata =
      typeof model.metadata === "object" && model.metadata !== null
        ? (model.metadata as Record<string, unknown>)
        : {};

    await prisma.providerModel.update({
      where: { id: modelId },
      data: {
        metadata: {
          ...currentMetadata,
          openapi_schema,
        },
      },
    });

    // Invalidate capabilities cache
    revalidatePath(`/api/models/${modelId}/capabilities`);

    return { ok: true };
  } catch (error) {
    console.error("Error refreshing model schema:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to refresh schema",
    };
  }
}
```

**Step 2: Import and use in admin actions**

Add to `src/app/(dashboard)/dashboard/admin/actions.ts`:

```typescript
export { refreshModelSchema } from "@/server/actions/refresh-model-schemas";
```

**Step 3: Add UI button (manual step for now)**

This is a foundation for adding refresh buttons in the admin UI. The UI implementation can be done later as a UX enhancement.

For now, admins can refresh schemas by re-importing models through "Browse Replicate".

**Step 4: Commit**

```bash
git add src/server/actions/refresh-model-schemas.ts src/app/(dashboard)/dashboard/admin/actions.ts
git commit -m "feat: add server action to refresh model schemas"
```

---

## Task 8: End-to-End Testing

**Goal:** Verify the complete flow works as designed.

**Files:**
- No code changes, testing only

**Step 1: Test model import with schema**

```bash
npm run dev
```

1. Navigate to http://localhost:6116/dashboard/admin
2. Go to Providers tab → Replicate → Browse Replicate
3. Import a new model that supports reference images (e.g., `lucataco/flux-dev-lora`)
4. Open Prisma Studio and verify `metadata.openapi_schema` exists
5. Use curl to verify capabilities API:
   ```bash
   curl http://localhost:6116/api/models/MODEL_ID/capabilities | jq
   ```

Expected: Schema is stored and capabilities API returns parsed data.

**Step 2: Test dynamic form behavior**

1. Navigate to Create Image page
2. Test with text-only model (hunyuan-image-3):
   - Reference Images section should be collapsed and greyed out
   - Negative Prompt section should be active (if supported)
3. Upload a reference image with compatible model
4. Switch to incompatible model
5. Verify image section greys out but images remain
6. Switch back to compatible model
7. Verify section becomes active with images still present

Expected: Form adapts without losing user data.

**Step 3: Test error scenarios**

1. Test with model that has no schema stored
2. Verify form shows all sections (fail-open behavior)
3. Test with network disconnected (dev tools)
4. Verify timeout happens and form shows all sections

Expected: Graceful degradation in all error cases.

**Step 4: Test actual image generation**

1. Select model that supports reference images (e.g., flux-kontext-apps/professional-headshot)
2. Upload your face photo as reference
3. Enter prompt: "professional headshot"
4. Submit the form
5. Verify job is created and reference image is sent
6. Check PM2 logs for any errors:
   ```bash
   pm2 logs pixelfoundry --lines 50
   ```

Expected: Image generation works with reference images properly sent to Replicate.

**Step 5: Verify caching**

1. Open browser dev tools → Network tab
2. Switch between models multiple times
3. Verify capabilities API requests are cached (304 or cache hit)

Expected: Capabilities are cached for 1 hour.

**Step 6: Document any issues found**

Create a checklist of any bugs or UX issues discovered during testing to address in follow-up tasks.

**Step 7: Final commit**

If any fixes were needed during testing:

```bash
git add .
git commit -m "fix: address issues found during end-to-end testing"
```

---

## Testing Strategy

**Unit Tests:**
- `model-capabilities.test.ts` - Covers schema parsing logic

**Manual Testing:**
- API endpoints via curl
- Form behavior with different models
- Error scenarios
- End-to-end flow

**Future Test Coverage:**
- E2E tests with Playwright for form interaction
- Integration tests for API routes
- Snapshot tests for capabilities parser with real Replicate schemas

---

## Rollout Plan

1. Deploy to staging environment
2. Manually test with production Replicate models
3. Verify no performance degradation (capabilities API is cached)
4. Monitor error logs for schema parsing issues
5. If successful, deploy to production
6. Add admin UI for refreshing schemas (future enhancement)
7. Add model capability badges in model selector (future enhancement)

---

## Future Enhancements

1. **Admin UI for Schema Management:**
   - Add "Refresh Schema" button next to each model in admin panel
   - Batch refresh all models button
   - Show schema last updated timestamp

2. **Model Selector Improvements:**
   - Show capability badges in model dropdown (📷 Supports reference images)
   - Filter models by capability
   - Sort by compatibility with current form state

3. **Advanced Parameters:**
   - Parse model-specific parameters from schema
   - Dynamically generate form fields for unique parameters
   - Store parameter defaults from schema

4. **Schema Validation:**
   - Add schema validation on import
   - Warn admins about malformed schemas
   - Provide fallback configurations

5. **Capability Overrides:**
   - Allow manual capability overrides in admin panel
   - Handle edge cases where schema detection fails
   - Support custom input mappings per model
