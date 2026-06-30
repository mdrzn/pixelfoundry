import { DashboardPageContainer } from "@/components/layout/dashboard-sidebar";

export default function CreateVideoLoading() {
  return (
    <DashboardPageContainer
      title="Create video"
      description="Generate videos from prompts or animate existing images."
    >
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-4">
          <div className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <p className="text-sm text-muted-foreground">Loading video models...</p>
        </div>
      </div>
    </DashboardPageContainer>
  );
}
