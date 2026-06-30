"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type AdminTabsProps = {
  overviewTab: React.ReactNode;
  usersTab: React.ReactNode;
  jobsTab: React.ReactNode;
  providersTab: React.ReactNode;
  logsTab: React.ReactNode;
};

export function AdminTabs({ overviewTab, usersTab, jobsTab, providersTab, logsTab }: AdminTabsProps) {
  return (
    <Tabs defaultValue="overview" className="space-y-6">
      <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-grid">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="users">Users</TabsTrigger>
        <TabsTrigger value="jobs">Jobs</TabsTrigger>
        <TabsTrigger value="providers">Providers</TabsTrigger>
        <TabsTrigger value="logs">Logs</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-6">
        {overviewTab}
      </TabsContent>

      <TabsContent value="users" className="space-y-6">
        {usersTab}
      </TabsContent>

      <TabsContent value="jobs" className="space-y-6">
        {jobsTab}
      </TabsContent>

      <TabsContent value="providers" className="space-y-6">
        {providersTab}
      </TabsContent>

      <TabsContent value="logs" className="space-y-6">
        {logsTab}
      </TabsContent>
    </Tabs>
  );
}
