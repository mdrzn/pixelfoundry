import { DashboardPageContainer } from "@/components/layout/dashboard-sidebar";

export default function EditImageLoading() {
  return (
    <DashboardPageContainer
      title="Edit image"
      description="Upload or select an existing asset to inpaint, outpaint, or apply style transfers."
    >
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-4">
          <div className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <p className="text-sm text-muted-foreground">Loading editor...</p>
        </div>
      </div>
    </DashboardPageContainer>
  );
}
