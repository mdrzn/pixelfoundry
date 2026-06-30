"use client";

import { useFormState } from "react-dom";
import { UserRole } from "@prisma/client";

import { updateRoleAction, type RoleActionState } from "@/app/(dashboard)/dashboard/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const initialState: RoleActionState = { ok: false };

export function UserRoleRow({
  user,
  disableDemoteSelf,
}: {
  user: {
    id: string;
    name: string | null;
    email: string;
    role: UserRole;
    credits: number;
    createdAt: Date;
    jobCount: number;
  };
  disableDemoteSelf?: boolean;
}) {
  const [state, formAction] = useFormState(updateRoleAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-md border p-3 md:flex-row md:items-center md:justify-between">
      <input type="hidden" name="userId" value={user.id} />
      <div>
        <p className="font-medium text-sm text-foreground">{user.name ?? user.email}</p>
        <p className="text-xs text-muted-foreground">{user.email}</p>
        <p className="text-xs text-muted-foreground">
          {user.jobCount} jobs - {user.credits} credits
        </p>
      </div>
      <div className="flex items-center gap-3">
        <select
          name="role"
          defaultValue={user.role}
          disabled={disableDemoteSelf}
          className="w-[160px] rounded-md border border-border bg-background px-2 py-1 text-sm"
        >
          <option value={UserRole.USER}>User</option>
          <option value={UserRole.ADMIN}>Admin</option>
        </select>
        <Button type="submit" variant="outline" size="sm" disabled={disableDemoteSelf}>
          Update
        </Button>
        {state.message ? (
          <Badge variant={state.ok ? "secondary" : "destructive"} className="text-[10px]">
            {state.message}
          </Badge>
        ) : null}
      </div>
    </form>
  );
}
