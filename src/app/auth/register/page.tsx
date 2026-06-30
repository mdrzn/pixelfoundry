"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { registerAction, type RegisterActionState } from "@/app/auth/register/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: RegisterActionState = { ok: false };

export default function RegisterPage() {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await registerAction(initialState, formData);
      setState(result);
      if (result.ok) {
        router.push("/auth/login?registered=1");
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Create your workspace</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Set up access to PixelFoundry, receive starter credits, and invite your team later.
        </p>
      </div>
      {state.error ? (
        <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" placeholder="Jordan Daniels" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="team@agency.ai"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="Use at least 8 characters"
            required
          />
        </div>
      </div>
      <Button className="w-full" type="submit" disabled={isPending}>
        {isPending ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/auth/login" className="font-medium text-primary">
          Sign in
        </Link>
      </p>
    </form>
  );
}

