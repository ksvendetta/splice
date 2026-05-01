import { useEffect, useMemo, useState } from "react";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HelpTip } from "@/components/HelpTip";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { getUndoHistory, restoreUndoEntry, subscribeUndo, type UndoEntry } from "@/lib/undoManager";

type HistoryButtonProps = {
  mode: "fiber" | "copper";
  helpMode?: boolean;
  onRestore?: () => void;
};

export function HistoryButton({ mode, helpMode = false, onRestore }: HistoryButtonProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<UndoEntry[]>(() => getUndoHistory(mode));
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    const syncHistory = () => setHistory(getUndoHistory(mode));
    syncHistory();
    return subscribeUndo(syncHistory);
  }, [mode]);

  const dateFormatter = useMemo(() => {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  }, []);

  const refreshModeQueries = async () => {
    await queryClient.refetchQueries({
      predicate: query => {
        const [endpoint] = query.queryKey as [unknown];
        return typeof endpoint === "string" && endpoint.startsWith(`/api/${mode}/`);
      },
    });
  };

  const handleRestore = async (entryId: string) => {
    setRestoringId(entryId);
    try {
      const entry = await restoreUndoEntry(mode, entryId);
      if (!entry) {
        toast({ title: "History state not found", variant: "destructive" });
        return;
      }

      await refreshModeQueries();
      onRestore?.();
      setOpen(false);
      toast({ title: "History restored", description: `Restored to before: ${entry.label}` });
    } catch (error) {
      toast({
        title: "Failed to restore history",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <HelpTip text="Open change history and restore an earlier project state." enabled={helpMode} side="bottom">
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={history.length === 0}
            data-testid="button-history"
            title={history.length > 0 ? `View history (${history.length})` : "No history yet"}
          >
            <History className="h-4 w-4 mr-2" />
            History
            {history.length > 0 && <span className="ml-1 text-xs text-muted-foreground">({history.length})</span>}
          </Button>
        </DialogTrigger>
      </HelpTip>
      <DialogContent className="max-w-lg" data-testid="dialog-history">
        <DialogHeader>
          <DialogTitle>Change History</DialogTitle>
          <DialogDescription>
            Restore the project to an earlier tracked state. Newer history entries after the selected state will be removed.
          </DialogDescription>
        </DialogHeader>
        {history.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No tracked changes yet.</div>
        ) : (
          <ScrollArea className="max-h-[420px] pr-3">
            <div className="space-y-2">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{entry.label}</div>
                    <div className="text-xs text-muted-foreground">
                      Restore to before this change - {dateFormatter.format(new Date(entry.createdAt))}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRestore(entry.id)}
                    disabled={restoringId !== null}
                    data-testid={`button-restore-history-${entry.id}`}
                  >
                    {restoringId === entry.id ? "Restoring" : "Restore"}
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
