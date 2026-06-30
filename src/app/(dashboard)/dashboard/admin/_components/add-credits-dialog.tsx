"use client";

import { useFormState } from "react-dom";
import { useState, useEffect } from "react";
import { CreditReason } from "@prisma/client";
import { CoinsIcon } from "lucide-react";

import { addCreditsAction, type AddCreditsActionState } from "@/app/(dashboard)/dashboard/admin/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const initialState: AddCreditsActionState = { ok: false };

type AddCreditsDialogProps = {
  userId: string;
  currentBalance: number;
  userName: string;
  onSuccess?: (newBalance: number) => void;
};

export function AddCreditsDialog({ userId, currentBalance, userName, onSuccess }: AddCreditsDialogProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState(addCreditsAction, initialState);
  const [amount, setAmount] = useState<string>("");

  useEffect(() => {
    if (state.ok && state.newBalance !== undefined) {
      onSuccess?.(state.newBalance);
      setOpen(false);
      setAmount("");
    }
  }, [state.ok, state.newBalance, onSuccess]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CoinsIcon className="mr-2 size-4" />
          Add Credits
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust Credits</DialogTitle>
          <DialogDescription>
            Add or deduct credits for <span className="font-medium text-foreground">{userName}</span>.
            Current balance: <span className="font-medium text-foreground">{currentBalance}</span> credits.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="userId" value={userId} />

          <div className="space-y-2">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              placeholder="Enter amount (positive to add, negative to deduct)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Use negative numbers to deduct credits (e.g., -100)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Select name="reason" required>
              <SelectTrigger id="reason">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CreditReason.GRANT}>Grant</SelectItem>
                <SelectItem value={CreditReason.ADJUST}>Adjust</SelectItem>
                <SelectItem value={CreditReason.REFUND}>Refund</SelectItem>
                <SelectItem value={CreditReason.DEDUCT}>Deduct</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              name="notes"
              placeholder="Add any notes about this adjustment..."
              rows={3}
            />
          </div>

          {amount && !isNaN(Number(amount)) && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm">
              <p className="font-medium text-blue-900">Preview:</p>
              <p className="text-blue-700">
                Current: {currentBalance} credits → New: {currentBalance + Number(amount)} credits
              </p>
            </div>
          )}

          {state.ok && state.message && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              {state.message}
            </div>
          )}

          {!state.ok && state.message && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {state.message}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">
              <CoinsIcon className="mr-2 size-4" />
              Adjust Credits
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
