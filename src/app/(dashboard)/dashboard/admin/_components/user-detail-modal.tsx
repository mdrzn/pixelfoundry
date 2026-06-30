"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { UserIcon, CoinsIcon, ClockIcon, XIcon, ArrowUpIcon, ArrowDownIcon } from "lucide-react";
import { UserRole, CreditReason, JobType, JobStatus } from "@prisma/client";

import {
  getUserDetailsAction,
  getUserCreditHistoryAction,
  getUserJobHistoryAction,
} from "@/app/(dashboard)/dashboard/admin/actions";
import { AddCreditsDialog } from "@/app/(dashboard)/dashboard/admin/_components/add-credits-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type UserDetailModalProps = {
  userId: string | null;
  onClose: () => void;
};

type UserDetails = {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  credits: number;
  createdAt: Date;
  updatedAt: Date;
  creditsGranted: number;
  creditsSpent: number;
  _count: {
    jobs: number;
    creditLedger: number;
    assets: number;
  };
};

type CreditTransaction = {
  id: string;
  delta: number;
  balanceAfter: number;
  reason: CreditReason;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  job: {
    id: string;
    type: JobType;
    prompt: string;
  } | null;
};

type JobHistory = {
  id: string;
  type: JobType;
  status: JobStatus;
  provider: string;
  prompt: string;
  cost: number;
  createdAt: Date;
  completedAt: Date | null;
};

const statusLabels: Record<JobStatus, string> = {
  QUEUED: "Queued",
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  FAILED: "Failed",
};

const reasonLabels: Record<CreditReason, string> = {
  GRANT: "Grant",
  DEDUCT: "Deduct",
  ADJUST: "Adjust",
  REFUND: "Refund",
};

export function UserDetailModal({ userId, onClose }: UserDetailModalProps) {
  const [user, setUser] = useState<UserDetails | null>(null);
  const [creditHistory, setCreditHistory] = useState<CreditTransaction[]>([]);
  const [jobHistory, setJobHistory] = useState<JobHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setUser(null);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        const [detailsRes, creditsRes, jobsRes] = await Promise.all([
          getUserDetailsAction(userId),
          getUserCreditHistoryAction(userId, 20),
          getUserJobHistoryAction(userId, 20),
        ]);

        if (detailsRes.ok && detailsRes.data) {
          setUser(detailsRes.data as UserDetails);
        }

        if (creditsRes.ok && creditsRes.data) {
          setCreditHistory(creditsRes.data as CreditTransaction[]);
        }

        if (jobsRes.ok && jobsRes.data) {
          setJobHistory(jobsRes.data as JobHistory[]);
        }
      } catch (error) {
        console.error("Failed to fetch user data:", error);
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [userId]);

  const handleCreditsAdded = (newBalance: number) => {
    if (user) {
      setUser({ ...user, credits: newBalance });
    }
    // Refetch credit history
    getUserCreditHistoryAction(userId!, 20).then((res) => {
      if (res.ok && res.data) {
        setCreditHistory(res.data as CreditTransaction[]);
      }
    });
  };

  if (!userId) return null;

  return (
    <Dialog open={Boolean(userId)} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <div className="text-sm text-muted-foreground">Loading user details...</div>
          </div>
        ) : user ? (
          <>
            <DialogHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                    <UserIcon className="size-6 text-muted-foreground" />
                  </div>
                  <div>
                    <DialogTitle>{user.name ?? "Unnamed User"}</DialogTitle>
                    <DialogDescription>{user.email}</DialogDescription>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose}>
                  <XIcon className="size-4" />
                </Button>
              </div>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <CoinsIcon className="size-4" />
                    Current Balance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold">{user.credits}</p>
                  <p className="text-xs text-muted-foreground">credits</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <ArrowUpIcon className="size-4" />
                    Total Granted
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-emerald-600">+{user.creditsGranted}</p>
                  <p className="text-xs text-muted-foreground">credits</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <ArrowDownIcon className="size-4" />
                    Total Spent
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-red-600">-{user.creditsSpent}</p>
                  <p className="text-xs text-muted-foreground">credits</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Role</Label>
                <Badge variant="outline" className={user.role === UserRole.ADMIN ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"}>
                  {user.role}
                </Badge>
              </div>
              <div className="space-y-2">
                <Label>Member Since</Label>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <ClockIcon className="size-4" />
                  {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="secondary">{user._count.jobs} jobs</Badge>
              <Badge variant="secondary">{user._count.assets} assets</Badge>
              <Badge variant="secondary">{user._count.creditLedger} transactions</Badge>
            </div>

            <Separator />

            <div className="flex items-center gap-2">
              <AddCreditsDialog
                userId={user.id}
                currentBalance={user.credits}
                userName={user.name ?? user.email}
                onSuccess={handleCreditsAdded}
              />
            </div>

            <Separator />

            <Tabs defaultValue="credits" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="credits">Credit History</TabsTrigger>
                <TabsTrigger value="jobs">Job History</TabsTrigger>
              </TabsList>

              <TabsContent value="credits" className="space-y-4">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead className="text-right">Balance After</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {creditHistory.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground">
                            No credit transactions
                          </TableCell>
                        </TableRow>
                      ) : (
                        creditHistory.map((transaction) => (
                          <TableRow key={transaction.id}>
                            <TableCell className="text-sm">
                              {format(new Date(transaction.createdAt), "MMM d, yyyy HH:mm")}
                            </TableCell>
                            <TableCell>
                              <span className={transaction.delta > 0 ? "text-emerald-600 font-medium" : "text-red-600 font-medium"}>
                                {transaction.delta > 0 ? "+" : ""}{transaction.delta}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div>
                                <Badge variant="outline" className="text-xs">
                                  {reasonLabels[transaction.reason]}
                                </Badge>
                                {transaction.job && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Job: {transaction.job.type}
                                  </p>
                                )}
                                {transaction.metadata &&
                                 typeof transaction.metadata === 'object' &&
                                 'notes' in transaction.metadata &&
                                 typeof transaction.metadata.notes === 'string' && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {transaction.metadata.notes}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {transaction.balanceAfter}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="jobs" className="space-y-4">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Prompt</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobHistory.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">
                            No jobs found
                          </TableCell>
                        </TableRow>
                      ) : (
                        jobHistory.map((job) => (
                          <TableRow key={job.id}>
                            <TableCell className="text-sm">
                              {format(new Date(job.createdAt), "MMM d, yyyy")}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {job.type}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={
                                  job.status === "COMPLETED"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : job.status === "FAILED"
                                      ? "bg-red-100 text-red-800"
                                      : "bg-blue-100 text-blue-800"
                                }
                              >
                                {statusLabels[job.status]}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-xs truncate text-sm">
                              {job.prompt}
                            </TableCell>
                            <TableCell className="text-right">-{job.cost}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          </>
        ) : (
          <div className="flex items-center justify-center p-8">
            <div className="text-sm text-destructive">Failed to load user details</div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-medium text-foreground">{children}</p>;
}
