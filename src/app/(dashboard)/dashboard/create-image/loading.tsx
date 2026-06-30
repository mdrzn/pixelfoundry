import { DashboardPageContainer } from "@/components/layout/dashboard-sidebar";

export default function CreateImageLoading() {
  return (
    <DashboardPageContainer
      title="Create image"
      description="Send a prompt to one of the curated models and manage quality presets."
    >
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-4">
          <div className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <p className="text-sm text-muted-foreground">Loading models and presets...</p>
        </div>
      </div>
    </DashboardPageContainer>
  );
}
