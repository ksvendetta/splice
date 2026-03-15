import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import type { ReactNode } from "react";

interface HelpTipProps {
  children: ReactNode;
  text: string;
  enabled: boolean;
  side?: "top" | "bottom" | "left" | "right";
}

export function HelpTip({ children, text, enabled, side = "bottom" }: HelpTipProps) {
  if (!enabled) return <>{children}</>;
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side} className="max-w-xs text-sm">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
