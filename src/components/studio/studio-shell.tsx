import * as React from "react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function StudioShell({
  title,
  description,
  estCost,
  action,
  inputPanel,
  tracker,
  preview,
}: {
  title: string;
  description?: string;
  estCost?: React.ReactNode;
  action?: React.ReactNode;
  inputPanel: React.ReactNode;
  tracker: React.ReactNode;
  preview: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {estCost || action ? (
          <div className="flex items-center gap-3">
            {estCost}
            {action}
          </div>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,320px)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Brief</CardTitle>
          </CardHeader>
          <CardContent>{inputPanel}</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Pipeline</CardTitle>
          </CardHeader>
          <CardContent>{tracker}</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Preview</CardTitle>
          </CardHeader>
          <CardContent>{preview}</CardContent>
        </Card>
      </div>
    </div>
  );
}
