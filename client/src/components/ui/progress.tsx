import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/lib/utils";

function Progress({
  className,
  value,
  dir,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const safeValue = typeof value === "number" ? Math.min(Math.max(value, 0), 100) : 0;
  const resolvedDir =
    dir
    ?? (typeof document !== "undefined"
      ? document.documentElement.dir || document.body.dir || "ltr"
      : "ltr");
  const progressOffset = 100 - safeValue;
  const progressTranslate = resolvedDir === "rtl" ? progressOffset : -progressOffset;

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      dir={resolvedDir}
      className={cn(
        "bg-primary/20 relative h-2 w-full overflow-hidden rounded-full",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="bg-primary h-full w-full flex-1 transition-all"
        style={{ transform: `translateX(${progressTranslate}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
