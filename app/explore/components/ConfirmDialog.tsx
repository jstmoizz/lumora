"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  // True while the caller's mutation from a previous confirm is still in
  // flight. Radix keeps this dialog (and its Confirm button) mounted for its
  // exit animation after `onOpenChange(false)` fires below, so without this
  // the button stays clickable — and thus able to fire a second mutation —
  // for that entire animation window, not just for one JS tick.
  confirmDisabled?: boolean;
}

// Shared confirmation step for Explore's two destructive actions (deleting a
// topic, resetting the whole graph) — built on the project's existing
// Dialog primitive (components/ui/dialog.tsx), which already gives focus
// trapping, Escape-to-close, and keyboard accessibility for free via Radix.
export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  confirmDisabled = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={confirmDisabled}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
