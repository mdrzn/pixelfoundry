"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCcwIcon, CopyIcon, CheckIcon } from "lucide-react";

import type { LibraryAsset } from "@/types/library";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

type ExplorerFilters = {
  search: string;
  type: "all" | "image" | "edit" | "video";
  status: "all" | "queued" | "processing" | "completed" | "failed";
  limit: number;
};

const initialFilters: ExplorerFilters = {
  search: "",
  type: "all",
  status: "all",
  limit: 20,
};

type ApiState = {
  data: LibraryAsset[];
  loading: boolean;
  error: string | null;
};

const initialState: ApiState = {
  data: [],
  loading: false,
  error: null,
};

export function ApiExplorer() {
  const [filters, setFilters] = useState<ExplorerFilters>(initialFilters);
  const [state, setState] = useState<ApiState>(initialState);
  const [copied, setCopied] = useState(false);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.search.trim()) {
      params.set("search", filters.search.trim());
    }
    if (filters.type !== "all") {
      params.set("type", filters.type);
    }
    if (filters.status !== "all") {
      params.set("status", filters.status);
    }
    params.set("limit", String(filters.limit));
    return params.toString();
  }, [filters]);

  const requestUrl = useMemo(() => {
    const base = "/api/library/assets";
    return queryString ? `${base}?${queryString}` : base;
  }, [queryString]);

  useEffect(() => {
    const controller = new AbortController();
    setState((prev) => ({ ...prev, loading: true, error: null }));

    fetch(requestUrl, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const json = await response.json();
        setState({
          data: Array.isArray(json.data) ? (json.data as LibraryAsset[]) : [],
          loading: false,
          error: null,
        });
      })
      .catch((error) => {
        if (error.name === "AbortError") {
          return;
        }
        setState({
          data: [],
          loading: false,
          error: error instanceof Error ? error.message : "Unable to load data.",
        });
      });

    return () => {
      controller.abort();
    };
  }, [requestUrl]);

  useEffect(() => {
    if (copied) {
      const timeout = window.setTimeout(() => setCopied(false), 2000);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [copied]);

  const handleCopySnippet = async () => {
    const example = `curl -X GET "${window.location.origin}${requestUrl}" \\
  -H "Accept: application/json" \\
  -H "Cookie: next-auth.session-token=<YOUR_SESSION_TOKEN>"`;
    await navigator.clipboard.writeText(example);
    setCopied(true);
  };

  const responseJson = useMemo(
    () => JSON.stringify(state.data, null, 2),
    [state.data],
  );

  const resetFilters = () => {
    setFilters(initialFilters);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Request builder</CardTitle>
          <CardDescription>
            Adjust filters to generate a request against the library assets API.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="search">Search</Label>
              <Input
                id="search"
                placeholder="Prompt contains..."
                value={filters.search}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, search: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type-filter">Type</Label>
              <Select
                value={filters.type}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, type: value as ExplorerFilters["type"] }))
                }
              >
                <SelectTrigger id="type-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="image">Create image</SelectItem>
                  <SelectItem value="edit">Edit image</SelectItem>
                  <SelectItem value="video">Create video</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status-filter">Status</Label>
              <Select
                value={filters.status}
                onValueChange={(value) =>
                  setFilters((prev) => ({
                    ...prev,
                    status: value as ExplorerFilters["status"],
                  }))
                }
              >
                <SelectTrigger id="status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="queued">Queued</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="limit">Limit</Label>
              <Input
                id="limit"
                type="number"
                min={1}
                max={200}
                value={filters.limit}
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    limit: Number(event.target.value) || initialFilters.limit,
                  }))
                }
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
            onClick={resetFilters}
          >
            <RefreshCcwIcon className="size-4" />
            Reset
          </Button>
          <div className="text-xs text-muted-foreground">
            Endpoint: <code className="text-foreground">{requestUrl}</code>
          </div>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle>cURL request</CardTitle>
            <CardDescription>
              Use your authenticated session cookie or API token to call the endpoint.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopySnippet}
            className="flex items-center gap-2"
          >
            {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
            {copied ? "Copied" : "Copy snippet"}
          </Button>
        </CardHeader>
        <CardContent>
          <Textarea value={`GET ${requestUrl}`} readOnly className="font-mono text-xs" rows={2} />
          <pre className="mt-4 overflow-auto rounded-md bg-muted p-4 text-xs">
{`curl -X GET "${typeof window !== "undefined" ? window.location.origin : ""}${requestUrl}" \\
  -H "Accept: application/json"`}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Response preview</CardTitle>
          <CardDescription>
            Successful responses include transformed assets in the same structure powering the library UI.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state.loading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ) : state.error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.error}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary">{state.data.length} results</Badge>
                <span>
                  Showing the latest {filters.limit} jobs matching your filters.
                </span>
              </div>
              <pre className="max-h-80 overflow-auto rounded-md bg-muted p-4 text-xs">
                {responseJson}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
