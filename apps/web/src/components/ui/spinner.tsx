import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Inline busy indicator. Inherits the current text colour so it works on both
 * filled and quiet buttons. Decorative by default — every place it is used
 * pairs it with a label that says what is happening, and two announcements of
 * the same state is one too many.
 */
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2
      aria-hidden
      className={cn(
        "size-4 animate-spin motion-reduce:animate-[spin_2s_linear_infinite]",
        className,
      )}
      {...props}
    />
  );
}

export { Spinner };
