import type { ReactNode } from "react";

import Link from "next/link";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4 py-12 text-foreground">
      <div className="mb-8 text-center">
        <Link
          href="/"
          className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground"
        >
          PixelFoundry Studio
        </Link>
      </div>
      <div className="w-full max-w-md rounded-3xl border bg-background p-8 shadow-lg">
        {children}
      </div>
    </div>
  );
}

