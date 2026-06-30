"use client";

import { useState } from "react";

import { UserDetailModal } from "@/app/(dashboard)/dashboard/admin/_components/user-detail-modal";
import { UsersTable } from "@/app/(dashboard)/dashboard/admin/_components/users-table";

type UserData = {
  id: string;
  name: string | null;
  email: string;
  role: "ADMIN" | "USER";
  credits: number;
  createdAt: Date;
  jobCount: number;
  creditsGranted: number;
  creditsSpent: number;
};

type UsersTabWrapperProps = {
  users: UserData[];
};

export function UsersTabWrapper({ users }: UsersTabWrapperProps) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  return (
    <>
      <UsersTable users={users} onUserClick={setSelectedUserId} />
      <UserDetailModal userId={selectedUserId} onClose={() => setSelectedUserId(null)} />
    </>
  );
}
