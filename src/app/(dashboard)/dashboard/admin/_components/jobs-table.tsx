"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { JobType, JobStatus } from "@prisma/client";
import { SearchIcon, BriefcaseIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type JobData = {
  id: string;
  type: JobType;
  status: JobStatus;
  provider: string;
  prompt: string;
  cost: number;
  createdAt: Date;
  user: {
    email: string;
    name: string | null;
  };
};

type JobsTableProps = {
  jobs: JobData[];
};

const statusLabels: Record<JobStatus, string> = {
  QUEUED: "Queued",
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

const typeLabels: Record<JobType, string> = {
  CREATE_IMAGE: "Create Image",
  EDIT_IMAGE: "Edit Image",
  CREATE_VIDEO: "Create Video",
};

export function JobsTable({ jobs }: JobsTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | JobStatus>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | JobType>("all");

  const filteredJobs = jobs.filter((job) => {
    const matchesSearch =
      !searchQuery ||
      job.prompt.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.user.email.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "all" || job.status === statusFilter;
    const matchesType = typeFilter === "all" || job.type === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });

  const statusColors: Record<JobStatus, string> = {
    [JobStatus.COMPLETED]: "bg-emerald-100 text-emerald-800 border-emerald-300",
    [JobStatus.PROCESSING]: "bg-blue-100 text-blue-800 border-blue-300",
    [JobStatus.QUEUED]: "bg-gray-100 text-gray-800 border-gray-300",
    [JobStatus.FAILED]: "bg-red-100 text-red-800 border-red-300",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BriefcaseIcon className="size-5" />
          Job Monitor
        </CardTitle>
        <CardDescription>
          View and filter all jobs across the platform. Search by prompt, job ID, or user email.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by prompt, job ID, or user..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
            <SelectTrigger className="w-full md:w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value={JobStatus.COMPLETED}>Completed</SelectItem>
              <SelectItem value={JobStatus.PROCESSING}>Processing</SelectItem>
              <SelectItem value={JobStatus.QUEUED}>Queued</SelectItem>
              <SelectItem value={JobStatus.FAILED}>Failed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as typeof typeFilter)}>
            <SelectTrigger className="w-full md:w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value={JobType.CREATE_IMAGE}>Create Image</SelectItem>
              <SelectItem value={JobType.EDIT_IMAGE}>Edit Image</SelectItem>
              <SelectItem value={JobType.CREATE_VIDEO}>Create Video</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Prompt</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredJobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No jobs found
                  </TableCell>
                </TableRow>
              ) : (
                filteredJobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {typeLabels[job.type]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColors[job.status]}>
                        {statusLabels[job.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      <p className="font-medium">{job.user.name ?? "Unnamed"}</p>
                      <p className="text-xs text-muted-foreground">{job.user.email}</p>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <p className="truncate text-sm">{job.prompt}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {job.provider}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">-{job.cost}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <p>
            Showing {filteredJobs.length} of {jobs.length} jobs
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
