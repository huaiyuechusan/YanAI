import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input placeholder:text-muted-foreground flex min-h-32 w-full rounded-lg border bg-white/78 px-4 py-3 text-sm shadow-sm outline-none focus-visible:border-rose-200 focus-visible:ring-[3px] focus-visible:ring-rose-100/80 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
