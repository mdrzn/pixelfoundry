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
