import Link from "next/link";
import { redirect } from "next/navigation";

import { mapAssetToLibraryItem, mapJobToLibraryAsset } from "@/lib/library";
import { getRecentJobs } from "@/lib/jobs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { DashboardPageContainer } from "@/components/layout/dashboard-sidebar";
import { Button } from "@/components/ui/button";
import type { AssetLibraryItem, LibraryAsset } from "@/types/library";

import { LibraryPageClient } from "./library-client";

export default async function LibraryPage() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  const jobs = await getRecentJobs(session.user.id, 90);

  const jobAssets: LibraryAsset[] = jobs.map((job) => mapJobToLibraryAsset(job));

  // Fetch all assets for the Assets tab
  const rawAssets = await prisma.asset.findMany({
    where: {
      userId: session.user.id,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 200, // Limit to most recent 200 assets
    include: {
      jobOutput: {
        select: { id: true },
      },
      jobInputUsages: {
        select: { id: true },
      },
    },
  });

  const libraryAssets: AssetLibraryItem[] = rawAssets.map((asset) =>
    mapAssetToLibraryItem(asset),
  );

  return (
    <DashboardPageContainer
      title="Asset library"
      description="Search, filter, download, and collaborate on your generated assets."
      action={
        <Button variant="outline" asChild>
          <Link href="/dashboard/library/api-explorer">Open API Explorer</Link>
        </Button>
      }
    >
      <LibraryPageClient generationAssets={jobAssets} libraryAssets={libraryAssets} />
    </DashboardPageContainer>
  );
}
