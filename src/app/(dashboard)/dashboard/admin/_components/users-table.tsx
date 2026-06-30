"use client";

import { useState } from "react";
import { UserRole } from "@prisma/client";
import { formatDistanceToNow } from "date-fns";
import { SearchIcon, UserIcon, UserCogIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

type UserData = {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  credits: number;
  createdAt: Date;
  jobCount: number;
  creditsGranted: number;
  creditsSpent: number;
};

type UsersTableProps = {
  users: UserData[];
  onUserClick: (userId: string) => void;
};

export function UsersTable({ users, onUserClick }: UsersTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | UserRole>("all");
  const [sortBy, setSortBy] = useState<"createdAt" | "credits" | "jobCount">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const filteredUsers = users
    .filter((user) => {
      const matchesSearch =
        !searchQuery ||
        user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesRole = roleFilter === "all" || user.role === roleFilter;

      return matchesSearch && matchesRole;
    })
    .sort((a, b) => {
      const modifier = sortOrder === "asc" ? 1 : -1;

      switch (sortBy) {
        case "credits":
          return (a.credits - b.credits) * modifier;
        case "jobCount":
          return (a.jobCount - b.jobCount) * modifier;
        case "createdAt":
        default:
          return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * modifier;
      }
    });

  const toggleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortOrder("desc");
    }
  };

  const roleColors: Record<UserRole, string> = {
    [UserRole.ADMIN]: "bg-purple-100 text-purple-800 border-purple-300",
    [UserRole.USER]: "bg-blue-100 text-blue-800 border-blue-300",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCogIcon className="size-5" />
          User Management
        </CardTitle>
        <CardDescription>
          Search, filter, and manage all platform users. Click on a user to view detailed information.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as typeof roleFilter)}>
            <SelectTrigger className="w-full md:w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value={UserRole.USER}>Users</SelectItem>
              <SelectItem value={UserRole.ADMIN}>Admins</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}>
            <SelectTrigger className="w-full md:w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="createdAt">Sort by Date</SelectItem>
              <SelectItem value="credits">Sort by Credits</SelectItem>
              <SelectItem value="jobCount">Sort by Jobs</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => toggleSort("credits")}>
                  Credits
                </TableHead>
                <TableHead className="text-right">Granted</TableHead>
                <TableHead className="text-right">Spent</TableHead>
                <TableHead className="text-right cursor-pointer hover:bg-muted/50" onClick={() => toggleSort("jobCount")}>
                  Jobs
                </TableHead>
                <TableHead className="cursor-pointer hover:bg-muted/50" onClick={() => toggleSort("createdAt")}>
                  Joined
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => (
                  <TableRow key={user.id} className="cursor-pointer hover:bg-muted/30" onClick={() => onUserClick(user.id)}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                          <UserIcon className="size-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{user.name ?? "Unnamed"}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={roleColors[user.role]}>
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{user.credits}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      +{user.creditsGranted}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      -{user.creditsSpent}
                    </TableCell>
                    <TableCell className="text-right">{user.jobCount}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUserClick(user.id);
                        }}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <p>
            Showing {filteredUsers.length} of {users.length} users
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
