import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-11 w-full rounded-xl border border-zinc-300 bg-background px-3.5 py-2.5 text-base text-foreground outline-none transition-[border-color,box-shadow] duration-200 ease-out placeholder:text-zinc-500 focus-visible:border-ring focus-visible:shadow-md focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:border-zinc-700 dark:placeholder:text-zinc-500",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
