import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, FolderOpen, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HelpTip } from "@/components/HelpTip";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { MAX_SAVES } from "@/lib/storage";
import type { Save } from "@shared/schema";

type HistoryButtonProps = {
  mode: "fiber" | "copper";
  helpMode?: boolean;
  onRestore?: () => void;
  /** Opens a project JSON file from disk (replaces the old Load button). */
  onBrowse?: () => void;
};

export function HistoryButton({ mode, helpMode = false, onRestore, onBrowse }: HistoryButtonProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const savesEndpoint = `/api/${mode}/saves`;
  const { data: saves = [] } = useQuery<Save[]>({ queryKey: [savesEndpoint] });

  const dateFormatter = useMemo(() => {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
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

  const handleRestore = async (save: Save) => {
    setBusyId(save.id);
    try {
      await apiRequest("POST", `${savesEndpoint}/${save.id}/load`, undefined);
      await refreshModeQueries();
      onRestore?.();
      setOpen(false);
      toast({ title: "Save restored", description: save.name });
    } catch (error) {
      toast({
        title: "Failed to restore save",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (save: Save) => {
    setBusyId(save.id);
    try {
      await apiRequest("DELETE", `${savesEndpoint}/${save.id}`, undefined);
      await queryClient.refetchQueries({ queryKey: [savesEndpoint] });
    } catch (error) {
      toast({
        title: "Failed to delete save",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirmClearAll) {
      setConfirmClearAll(true);
      return;
    }
    try {
      await apiRequest("DELETE", savesEndpoint, undefined);
      await queryClient.refetchQueries({ queryKey: [savesEndpoint] });
      toast({ title: "All saves deleted" });
    } catch (error) {
      toast({
        title: "Failed to delete saves",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setConfirmClearAll(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setConfirmClearAll(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <HelpTip
        text="Browse saved projects. Each Reset stores the current project here, and you can also open a project file from disk."
        enabled={helpMode}
        side="bottom"
      >
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            data-testid="button-history"
            title={saves.length > 0 ? `Saved projects (${saves.length})` : "No saved projects yet"}
          >
            <History className="h-4 w-4 mr-2" />
            History
            {saves.length > 0 && <span className="ml-1 text-xs text-muted-foreground">({saves.length})</span>}
          </Button>
        </DialogTrigger>
      </HelpTip>
      <DialogContent className="max-w-lg" data-testid="dialog-history">
        <DialogHeader>
          <DialogTitle>Saved Projects</DialogTitle>
          <DialogDescription>
            Every Reset saves the current project here. The newest {MAX_SAVES} are kept; older ones drop off.
          </DialogDescription>
        </DialogHeader>

        {saves.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground" data-testid="text-history-empty">
            No saved projects yet. Reset stores one automatically, or open a project file below.
          </div>
        ) : (
          <ScrollArea className="max-h-[420px] pr-3">
            <div className="space-y-2">
              {saves.map((save) => (
                <div
                  key={save.id}
                  className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{save.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {dateFormatter.format(new Date(save.createdAt))}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRestore(save)}
                      disabled={busyId !== null}
                      data-testid={`button-restore-save-${save.id}`}
                    >
                      {busyId === save.id ? "Loading" : "Load"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(save)}
                      disabled={busyId !== null}
                      title="Delete this save"
                      data-testid={`button-delete-save-${save.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setOpen(false);
              onBrowse?.();
            }}
            data-testid="button-browse-save-file"
          >
            <FolderOpen className="h-4 w-4 mr-2" />
            Open file...
          </Button>
          <Button
            variant={confirmClearAll ? "destructive" : "outline"}
            size="sm"
            onClick={handleDeleteAll}
            disabled={saves.length === 0}
            data-testid="button-delete-all-saves"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {confirmClearAll ? "Click again to confirm" : "Delete all"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
