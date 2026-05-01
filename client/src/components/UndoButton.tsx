import { useEffect, useState } from "react";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HelpTip } from "@/components/HelpTip";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { getUndoCount, subscribeUndo, undoLastChange } from "@/lib/undoManager";

type UndoButtonProps = {
  mode: "fiber" | "copper";
  helpMode?: boolean;
  onUndo?: () => void;
};

export function UndoButton({ mode, helpMode = false, onUndo }: UndoButtonProps) {
  const { toast } = useToast();
  const [undoCount, setUndoCount] = useState(() => getUndoCount(mode));
  const [isUndoing, setIsUndoing] = useState(false);

  useEffect(() => {
    const syncUndoCount = () => setUndoCount(getUndoCount(mode));
    syncUndoCount();
    return subscribeUndo(syncUndoCount);
  }, [mode]);

  const handleUndo = async () => {
    setIsUndoing(true);
    try {
      const entry = await undoLastChange(mode);
      if (!entry) {
        toast({ title: "Nothing to undo" });
        return;
      }

      await queryClient.refetchQueries({
        predicate: query => {
          const [endpoint] = query.queryKey as [unknown];
          return typeof endpoint === "string" && endpoint.startsWith(`/api/${mode}/`);
        },
      });

      onUndo?.();
      toast({ title: "Change undone", description: entry.label });
    } catch (error) {
      toast({
        title: "Failed to undo change",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setIsUndoing(false);
    }
  };

  return (
    <HelpTip text="Undo the most recent cable or circuit change." enabled={helpMode} side="bottom">
      <Button
        variant="outline"
        size="sm"
        onClick={handleUndo}
        disabled={undoCount === 0 || isUndoing}
        data-testid="button-undo"
        title={undoCount > 0 ? `Undo last change (${undoCount})` : "Nothing to undo"}
      >
        <Undo2 className="h-4 w-4 mr-2" />
        Undo
        {undoCount > 0 && <span className="ml-1 text-xs text-muted-foreground">({undoCount})</span>}
      </Button>
    </HelpTip>
  );
}
