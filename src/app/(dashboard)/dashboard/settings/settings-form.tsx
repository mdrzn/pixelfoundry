"use client";

import { useEffect } from "react";
import { useFormState } from "react-dom";
import { useSession } from "next-auth/react";

import {
  updateProfileAction,
  type UpdateProfileState,
} from "@/app/(dashboard)/dashboard/settings/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const initialState: UpdateProfileState = { ok: false };

export function SettingsForm({
  defaultName,
  email,
}: {
  defaultName: string;
  email: string;
}) {
  const [state, formAction] = useFormState(updateProfileAction, initialState);
  const { update } = useSession();

  useEffect(() => {
    if (state.ok) {
      void update();
    }
  }, [state.ok, update]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <form action={formAction}>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Displayed across exports and logs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {state.error ? (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {state.error}
              </div>
            ) : null}
            {state.ok ? (
              <div className="rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-primary">
                Profile updated successfully.
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="name">Display name</Label>
              <Input id="name" name="name" defaultValue={defaultName} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={email} disabled />
            </div>
            <Button type="submit">Save changes</Button>
          </CardContent>
        </form>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Decide how you hear about finished runs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <h3 className="text-sm font-medium">Email updates</h3>
              <p className="text-xs text-muted-foreground">
                Receive an email when lengthy jobs complete.
              </p>
            </div>
            <Switch defaultChecked disabled />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <h3 className="text-sm font-medium">Webhook callbacks</h3>
              <p className="text-xs text-muted-foreground">
                POST job metadata to your integration endpoint.
              </p>
            </div>
            <Switch disabled />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

