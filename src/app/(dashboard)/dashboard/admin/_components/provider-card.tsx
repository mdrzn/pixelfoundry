"use client";

import { useMemo, useState } from "react";
import { useFormState } from "react-dom";
import { ProviderCredential, Provider } from "@prisma/client";

import { updateProviderAction, type ProviderActionState } from "@/app/(dashboard)/dashboard/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const initialState: ProviderActionState = { ok: false };

const providerLabels: Record<Provider, string> = {
  [Provider.REPLICATE]: "Replicate",
  [Provider.OPENAI]: "OpenAI",
  [Provider.GEMINI]: "Gemini",
};

function maskKey(key?: string | null) {
  if (!key || key.length < 6) {
    return "Not set";
  }
  return `${key.slice(0, 3)}****${key.slice(-3)}`;
}

export function ProviderCredentialCard({
  provider,
  credential,
  isExpanded = false,
  onToggle,
}: {
  provider: Provider;
  credential?: ProviderCredential;
  isExpanded?: boolean;
  onToggle?: () => void;
}) {
  const [state, formAction] = useFormState(updateProviderAction, initialState);
  const maskedKey = useMemo(() => maskKey(credential?.apiKey), [credential?.apiKey]);
  const [enabled, setEnabled] = useState(credential?.isActive ?? false);

  // If no onToggle provided, always show expanded (backward compatibility)
  const showExpanded = onToggle ? isExpanded : true;

  return (
    <Card
      className={`transition-all duration-300 ${!showExpanded && onToggle ? 'cursor-pointer hover:border-primary/50' : ''}`}
      onClick={!showExpanded && onToggle ? onToggle : undefined}
    >
      {!showExpanded ? (
        // Collapsed State
        <CardHeader className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <CardTitle className="text-base">{providerLabels[provider]}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={credential?.isActive ? "default" : "secondary"} className="text-xs">
                  {credential?.isActive ? "Active" : "Disabled"}
                </Badge>
                <span className="text-xs text-muted-foreground">{maskedKey}</span>
              </div>
            </div>
            <svg
              className="h-5 w-5 text-muted-foreground"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </CardHeader>
      ) : (
        // Expanded State
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="isActive" value={enabled ? "on" : "off"} />
          <input type="hidden" name="provider" value={provider} />
          <CardHeader className="flex flex-col gap-1 pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{providerLabels[provider]}</CardTitle>
              {onToggle ? (
                <button
                  type="button"
                  onClick={onToggle}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M5 15l7-7 7 7" />
                  </svg>
                </button>
              ) : null}
            </div>
            <CardDescription className="text-xs">
              {credential?.isActive ? "Active" : "Disabled"} - Current key: {maskedKey}
            </CardDescription>
            {state.message ? (
              <Badge variant={state.ok ? "secondary" : "destructive"} className="w-fit text-xs">
                {state.message}
              </Badge>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <div className="space-y-2">
              <Label htmlFor={`${provider}-label`} className="text-sm">Label</Label>
              <Input
                id={`${provider}-label`}
                name="label"
                defaultValue={credential?.label ?? ""}
                placeholder="Optional description"
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${provider}-apiKey`} className="text-sm">API key</Label>
              <Input
                id={`${provider}-apiKey`}
                name="apiKey"
                type="password"
                placeholder={credential ? "Leave blank to keep existing" : "Paste API key"}
                className="h-9"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Enabled</p>
                <p className="text-xs text-muted-foreground">
                  Toggle to enable or disable this provider in the studio.
                </p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
          </CardContent>
          <CardFooter className="pt-0">
            <Button type="submit" size="sm">Save provider</Button>
          </CardFooter>
        </form>
      )}
    </Card>
  );
}
