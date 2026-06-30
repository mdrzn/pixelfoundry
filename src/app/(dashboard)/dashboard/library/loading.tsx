import { DashboardPageContainer } from "@/components/layout/dashboard-sidebar";

export default function LibraryLoading() {
  return (
    <DashboardPageContainer
      title="Asset library"
      description="Search, filter, download, and collaborate on your generated assets."
    >
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-4">
          <div className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <p className="text-sm text-muted-foreground">Loading your assets...</p>
        </div>
      </div>
    </DashboardPageContainer>
  );
}
