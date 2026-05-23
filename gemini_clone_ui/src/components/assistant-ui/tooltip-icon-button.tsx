import { type ComponentPropsWithRef, forwardRef } from "react";
import { cn } from "@/lib/utils";

export type TooltipIconButtonProps = ComponentPropsWithRef<"button"> & {
  tooltip: string;
  side?: "top" | "bottom" | "left" | "right";
};

export const TooltipIconButton = forwardRef<
  HTMLButtonElement,
  TooltipIconButtonProps
>(({ children, tooltip, className, ...rest }, ref) => {
  return (
    <button
      {...rest}
      title={tooltip}
      className={cn(
        "aui-button-icon size-8 p-1.5 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors",
        className
      )}
      ref={ref}
    >
      {children}
      <span className="sr-only">{tooltip}</span>
    </button>
  );
});

TooltipIconButton.displayName = "TooltipIconButton";
