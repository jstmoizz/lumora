"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MobilePanelDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  side: "left" | "right";
  children: React.ReactNode;
}

// A side-anchored variant of the project's Dialog — that one's a centered
// modal, so overriding its positioning/animation would fight nearly every
// default it sets. Built directly on the same underlying `radix-ui` Dialog
// primitive it wraps, reusing the existing dependency. Radix gives this
// focus trapping, Escape-to-close, and focus-return for free.
export default function MobilePanelDrawer({
  open,
  onOpenChange,
  title,
  side,
  children,
}: MobilePanelDrawerProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/20 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed top-0 z-50 flex h-full w-72 max-w-[85vw] flex-col bg-card p-4 shadow-lg outline-none duration-200 data-open:animate-in data-closed:animate-out",
            side === "left"
              ? "left-0 border-r border-border data-open:slide-in-from-left data-closed:slide-out-to-left"
              : "right-0 border-l border-border data-open:slide-in-from-right data-closed:slide-out-to-right",
          )}
        >
          {/*
            Visually hidden: the panel components rendered as `children`
            already show their own visible heading ("Recent Prompts" /
            handled inside QuizPanel's own copy) — this exists only so
            Radix's accessibility-required title still announces the
            drawer's purpose to assistive tech without rendering a second,
            redundant heading on screen.
          */}
          <DialogPrimitive.Title className="sr-only">
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Close asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Close ${title.toLowerCase()}`}
              className="absolute top-2 right-2"
            >
              <XIcon aria-hidden="true" />
            </Button>
          </DialogPrimitive.Close>
          <div className="min-h-0 flex-1 overflow-y-auto pt-7">
            {children}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
