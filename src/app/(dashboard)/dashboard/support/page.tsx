import { DashboardPageContainer } from "@/components/layout/dashboard-sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export default function SupportPage() {
  return (
    <DashboardPageContainer
      title="Support"
      description="Open a ticket or explore quick fixes with our knowledge base."
      action={<Button variant="outline">View system status</Button>}
    >
      <Card>
        <CardHeader>
          <CardTitle>Send a request</CardTitle>
          <CardDescription>
            Share context, run IDs, or screenshots and our team will respond within one business day.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea placeholder="Describe the issue you're facing..." rows={6} />
          <div className="flex items-center justify-end gap-3">
            <Button variant="outline">Attach files</Button>
            <Button>Submit ticket</Button>
          </div>
        </CardContent>
      </Card>
    </DashboardPageContainer>
  );
}

