import { DashboardPageContainer } from "@/components/layout/dashboard-sidebar";

export default function DashboardLoading() {
  return (
    <DashboardPageContainer
      title="Loading..."
      description="Please wait while we load your content."
    >
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-4">
          <div className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    </DashboardPageContainer>
  );
}
