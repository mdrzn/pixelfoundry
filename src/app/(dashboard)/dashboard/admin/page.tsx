import { Provider } from "@prisma/client";
import { formatDistanceToNow } from "date-fns";

import { AdminTabs } from "@/app/(dashboard)/dashboard/admin/_components/admin-tabs";
import { CompactProviderCredentials } from "@/app/(dashboard)/dashboard/admin/_components/compact-provider-credentials";
import { JobsTable } from "@/app/(dashboard)/dashboard/admin/_components/jobs-table";
import { ProviderModelManager } from "@/app/(dashboard)/dashboard/admin/_components/provider-model-manager";
import { UsersTabWrapper } from "@/app/(dashboard)/dashboard/admin/_components/users-tab-wrapper";
import { DashboardPageContainer } from "@/components/layout/dashboard-sidebar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminDashboardData, getEnhancedUserList, requireAdminUser } from "@/lib/admin";

const providerOrder: Provider[] = [
  Provider.REPLICATE,
  Provider.GEMINI,
  Provider.OPENAI,
];

const jobTypeLabel: Record<string, string> = {
  CREATE_IMAGE: "Create image",
  EDIT_IMAGE: "Edit image",
  CREATE_VIDEO: "Create video",
};

const statusLabel: Record<string, string> = {
  QUEUED: "Queued",
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

export default async function AdminDashboardPage() {
  await requireAdminUser();
  const [data, enhancedUsers] = await Promise.all([
    getAdminDashboardData(),
    getEnhancedUserList(),
  ]);

  const providerMap = new Map(
    data.providerCredentials.map((credential) => [credential.provider, credential]),
  );

  // Prepare all jobs data for the jobs table
  const allJobs = data.recentJobs.map((job) => ({
    id: job.id,
    type: job.type,
    status: job.status,
    provider: job.provider,
    prompt: job.prompt,
    cost: job.cost,
    createdAt: job.createdAt,
    user: {
      email: job.user.email,
      name: job.user.name,
    },
  }));

  return (
    <DashboardPageContainer
      title="Admin console"
      description="Monitor platform health, manage provider credentials, and curate access."
    >
      <AdminTabs
        overviewTab={
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total users</CardTitle>
                  <CardDescription className="text-3xl font-semibold text-foreground">
                    {data.metrics.totalUsers}
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total jobs</CardTitle>
                  <CardDescription className="text-3xl font-semibold text-foreground">
                    {data.metrics.totalJobs}
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">Credits granted</CardTitle>
                  <CardDescription className="text-3xl font-semibold text-foreground">
                    {data.metrics.creditsGranted}
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium text-muted-foreground">Credits spent</CardTitle>
                  <CardDescription className="text-3xl font-semibold text-foreground">
                    {data.metrics.creditsSpent}
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Jobs by type</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {data.jobsByType.map((group) => (
                    <div key={group.type} className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
                      <span>{jobTypeLabel[group.type] ?? group.type}</span>
                      <Badge variant="secondary">{group._count._all}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Jobs by status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {data.jobsByStatus.map((group) => (
                    <div key={group.status} className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
                      <span>{statusLabel[group.status] ?? group.status}</span>
                      <Badge variant="outline">{group._count._all}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Recent jobs</CardTitle>
                <CardDescription>Latest activity across all workspaces.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                {data.recentJobs.length === 0 ? (
                  <p>No jobs have been submitted yet.</p>
                ) : (
                  data.recentJobs.map((job) => (
                    <div key={job.id} className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground">
                          {jobTypeLabel[job.type] ?? job.type}
                        </span>
                        <span>{formatDistanceToNow(job.createdAt, { addSuffix: true })}</span>
                      </div>
                      <p className="line-clamp-1 text-sm text-foreground">{job.prompt}</p>
                      <div className="flex items-center gap-2 text-xs">
                        <Badge variant="outline">{job.provider}</Badge>
                        <Badge variant="secondary">{statusLabel[job.status] ?? job.status}</Badge>
                        <span>{job.user.name ?? job.user.email}</span>
                        <span className="ml-auto">-{job.cost} credits</span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </>
        }
        usersTab={<UsersTabWrapper users={enhancedUsers} />}
        jobsTab={<JobsTable jobs={allJobs} />}
        providersTab={
          <>
            <section className="space-y-3">
              <div>
                <h3 className="text-lg font-semibold">Provider credentials</h3>
                <p className="text-sm text-muted-foreground">
                  Manage API keys for downstream vendors. Keys are stored in Postgres and only visible to administrators.
                </p>
              </div>
              <CompactProviderCredentials
                providers={providerOrder}
                credentialMap={providerMap}
              />
            </section>

            <ProviderModelManager models={data.providerModels} />
          </>
        }
        logsTab={
          <Card>
            <CardHeader>
              <CardTitle>System Logs</CardTitle>
              <CardDescription>
                View system activity and administrative actions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Coming soon...</p>
            </CardContent>
          </Card>
        }
      />
    </DashboardPageContainer>
  );
}
