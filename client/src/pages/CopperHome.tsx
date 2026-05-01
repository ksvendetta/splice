import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Cable, Circuit, InsertCable, parseCircuitIdParts } from "@shared/schema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CableCard } from "@/components/CableCard";
import { CableForm } from "@/components/CableForm";
import { CableVisualization } from "@/components/CableVisualization";
import { CircuitManagement } from "@/components/CircuitManagement";
import { SpliceTree } from "@/components/SpliceTree";
import { CropDialog } from "@/components/CameraCaptureDialog";
import { UndoButton } from "@/components/UndoButton";
import { HistoryButton } from "@/components/HistoryButton";
import { Plus, Cable as CableIcon, Workflow, Save, Upload, RotateCcw, Edit2, Check, X, Trash2, Layers, Home as HomeIcon, Phone, Sparkles, ChevronLeft, ChevronDown, HelpCircle, Play } from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { HelpTip } from "@/components/HelpTip";
import { TutorialCursor } from "@/components/TutorialCursor";
import { runCopperTutorial, type CursorPos } from "@/lib/tutorialRunner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Switch as ToggleSwitch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function CopperHome({ mode, setMode }: { mode: "fiber" | "copper"; setMode: (mode: "fiber" | "copper") => void }) {
  const { toast } = useToast();
  const [helpMode, setHelpMode] = useState(false);
  const [tutorialRunning, setTutorialRunning] = useState(false);
  const [tutorialDialogOpen, setTutorialDialogOpen] = useState(false);
  const tutorialAbortRef = useRef<AbortController | null>(null);
  const [cursorPos, setCursorPos] = useState<CursorPos>({ x: 0, y: 0, visible: false, clicking: false });
  const [selectedCableId, setSelectedCableId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("input");
  const [contextCableId, setContextCableId] = useState<string | null>(null);
  const [cableDialogOpen, setCableDialogOpen] = useState(false);
  const [editingCable, setEditingCable] = useState<Cable | null>(null);
  const [editingType, setEditingType] = useState(false);
  const [editingSize, setEditingSize] = useState(false);
  const [tempType, setTempType] = useState<"Feed" | "Distribution">("Feed");
  const [tempSize, setTempSize] = useState<number>(50);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveFileName, setSaveFileName] = useState("");
  const [useBinderView, setUseBinderView] = useState(true);
  const [spliceTreeOpen, setSpliceTreeOpen] = useState(() => {
    const stored = localStorage.getItem(`spliceTreeOpen-${mode}`);
    return stored === null ? true : stored === "true";
  });

  // Splice naming state
  const [mainSpliceName, setMainSpliceName] = useState<string>(() => {
    return localStorage.getItem(`spliceName-${mode}`) ?? "Main";
  });
  const [spliceNamingDialogOpen, setSpliceNamingDialogOpen] = useState(false);
  const [spliceNamingInput, setSpliceNamingInput] = useState("");
  const [spliceNamingContext, setSpliceNamingContext] = useState<"main" | "sub">("main");
  const [pendingSpliceContextCable, setPendingSpliceContextCable] = useState<Cable | null>(null);
  const [editingMainSpliceName, setEditingMainSpliceName] = useState(false);
  const [tempMainSpliceName, setTempMainSpliceName] = useState("");

  // Camera capture state — lives at page level so it survives dialog close/reopen
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const cameraActiveRef = useRef(false);
  const [cameraRawImage, setCameraRawImage] = useState<string>("");
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cameraOcrImage, setCameraOcrImage] = useState<string>("");

  const handleCameraFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      cameraActiveRef.current = false;
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setTimeout(() => {
        setCameraRawImage(reader.result as string);
        setCropDialogOpen(true);
        setCableDialogOpen(true);
        cameraActiveRef.current = false;
      }, 200);
    };
    reader.onerror = () => {
      cameraActiveRef.current = false;
    };
    reader.readAsDataURL(file);
    setTimeout(() => { if (e.target) e.target.value = ""; }, 500);
  };

  const handleTakePicture = () => {
    cameraActiveRef.current = true;
    cameraInputRef.current?.click();
  };

  // Use mode-specific API endpoints to keep fiber and copper data separate
  const apiMode = mode === "fiber" ? "fiber" : "copper";
  const cablesEndpoint = `/api/${apiMode}/cables`;
  const circuitsEndpoint = `/api/${apiMode}/circuits`;

  const { data: cables = [], isLoading: cablesLoading } = useQuery<Cable[]>({
    queryKey: [cablesEndpoint],
  });

  const { data: allCircuits = [], isLoading: circuitsLoading } = useQuery<Circuit[]>({
    queryKey: [circuitsEndpoint],
  });

  const handleCableSelect = (cableId: string) => {
    setSelectedCableId(cableId);
    setActiveTab("input");
  };

  // Clicking a splice-tree node switches context
  const handleTreeNodeClick = (cableId: string) => {
    const cable = cables.find(c => c.id === cableId);
    if (!cable) return;
    if (cable.type === "Feed") {
      // Clicking a feed → go back to root context
      setContextCableId(null);
      setSelectedCableId(cableId);
      setActiveTab("input");
    } else {
      // Clicking a distribution → switch to its sub-splice context
      setContextCableId(cableId);
      setSelectedCableId(null);
      setActiveTab("input");
    }
  };

  // Listen for floating stop button click during tutorial
  useEffect(() => {
    const handler = () => tutorialAbortRef.current?.abort();
    window.addEventListener("tutorial-stop", handler);
    return () => window.removeEventListener("tutorial-stop", handler);
  }, []);

  // Safety: if the context cable is deleted, reset to root
  useEffect(() => {
    if (contextCableId !== null && !cables.find(c => c.id === contextCableId)) {
      setContextCableId(null);
      setSelectedCableId(null);
      setActiveTab("input");
    }
  }, [cables, contextCableId]);

  // Sync mainSpliceName when mode changes
  useEffect(() => {
    const stored = localStorage.getItem(`spliceName-${mode}`) ?? "Main";
    setMainSpliceName(stored);
  }, [mode]);

  // Filter cables by the current splice context
  const contextCables = useMemo(() => {
    if (contextCableId === null) {
      // Root context: Feed cables + Distribution cables with no parentCableId
      return cables.filter(c => c.type === "Feed" || !c.parentCableId);
    }
    // Sub-splice context: the context cable (as feed) + its direct children
    const contextCable = cables.find(c => c.id === contextCableId);
    const children = cables.filter(c => c.parentCableId === contextCableId && c.type === "Distribution");
    return contextCable ? [contextCable, ...children] : children;
  }, [cables, contextCableId]);

  // Sort context cables: "Feed" first, then Distribution
  const sortedCables = useMemo(() => {
    const feeds = contextCables.filter(c => {
      if (contextCableId !== null && c.id === contextCableId) return true;
      return c.type === "Feed";
    });
    const dists = contextCables.filter(c => {
      if (contextCableId !== null && c.id === contextCableId) return false;
      return c.type === "Distribution";
    });
    return [...feeds, ...dists];
  }, [contextCables, contextCableId]);

  // Breadcrumb trail for sub-splice navigation
  const contextBreadcrumbs = useMemo(() => {
    const crumbs: Array<{ id: string | null; name: string }> = [
      { id: null, name: mainSpliceName || "Main Splice" }
    ];
    if (contextCableId === null) return crumbs;
    const chain: Cable[] = [];
    let current = cables.find(c => c.id === contextCableId);
    while (current) {
      chain.unshift(current);
      current = current.parentCableId
        ? cables.find(c => c.id === current!.parentCableId)
        : undefined;
    }
    for (const cable of chain) {
      crumbs.push({ id: cable.id, name: cable.spliceName ?? cable.name });
    }
    return crumbs;
  }, [cables, contextCableId, mainSpliceName]);

  const createCableMutation = useMutation({
    mutationFn: async (data: InsertCable) => {
      return await apiRequest("POST", cablesEndpoint, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [cablesEndpoint] });
      queryClient.invalidateQueries({ queryKey: [circuitsEndpoint] });
      setCableDialogOpen(false);
      toast({ title: "Cable created successfully" });
    },
    onError: (error: any) => {
      const errorMessage = error?.message || "Failed to create cable";
      toast({ title: errorMessage, variant: "destructive" });
    },
  });

  const updateCableMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: InsertCable }) => {
      return await apiRequest("PUT", `${cablesEndpoint}/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [cablesEndpoint] });
      queryClient.invalidateQueries({ queryKey: [circuitsEndpoint] });
      setCableDialogOpen(false);
      setEditingCable(null);
      toast({ title: "Cable updated successfully" });
    },
    onError: (error: any) => {
      const errorMessage = error?.message || "Failed to update cable";
      toast({ title: errorMessage, variant: "destructive" });
    },
  });

  const deleteCableMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `${cablesEndpoint}/${id}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [cablesEndpoint] });
      queryClient.invalidateQueries({ queryKey: [circuitsEndpoint] });
      toast({ title: "Cable deleted successfully" });
    },
    onError: (error: any) => {
      // If cable doesn't exist (404), still remove from UI
      if (error?.message?.includes("not found") || error?.message?.includes("404")) {
        queryClient.invalidateQueries({ queryKey: [cablesEndpoint] });
        queryClient.invalidateQueries({ queryKey: [circuitsEndpoint] });
        toast({ title: "Cable removed from display" });
      } else {
        toast({ title: "Failed to delete cable", variant: "destructive" });
      }
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", `/api/${apiMode}/reset`, undefined);
    },
    onSuccess: async () => {
      // Force refetch to clear the UI
      await queryClient.refetchQueries({ queryKey: [cablesEndpoint] });
      await queryClient.refetchQueries({ queryKey: [circuitsEndpoint] });
      setSelectedCableId(null);
      setContextCableId(null);
      setResetDialogOpen(false);
      // Clear splice name so fresh-start dialog appears again
      localStorage.removeItem(`spliceName-${mode}`);
      setMainSpliceName("");
      toast({ title: "All data has been reset" });
    },
    onError: () => {
      toast({ title: "Failed to reset data", variant: "destructive" });
    },
  });

  const updateCableSpliceNameMutation = useMutation({
    mutationFn: async ({ id, spliceName }: { id: string; spliceName: string }) => {
      const cable = cables.find(c => c.id === id)!;
      return await apiRequest("PUT", `${cablesEndpoint}/${id}`, { ...cable, spliceName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [cablesEndpoint] });
    },
  });

  const handleSaveClick = () => {
    setSaveFileName(""); // Clear previous filename
    setSaveDialogOpen(true);
  };

  const handleSaveConfirm = async () => {
    const projectData = {
      mode: mode, // Store the current mode
      cables,
      circuits: allCircuits,
    };

    const dataStr = JSON.stringify(projectData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });

    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;

    // Use user-provided filename or default
    const filename = saveFileName.trim()
      ? `${saveFileName.trim()}.json`
      : `copper-splice-project-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setSaveDialogOpen(false);
    setSaveFileName("");

    toast({
      title: "Project saved",
      description: `${cables.length} cable(s) and ${allCircuits.length} circuit(s) saved to file`
    });
  };

  const handleLoad = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const projectData = JSON.parse(text);

        if (!projectData.cables || !projectData.circuits) {
          toast({ title: "Invalid project file format", variant: "destructive" });
          return;
        }

        // Detect the mode from the saved file (default to 'fiber' for backwards compatibility)
        const savedMode = projectData.mode || 'fiber';

        // Switch to the correct mode
        setMode(savedMode);

        // Use mode-specific database and API endpoints
        const { getDb } = await import("@/lib/db");
        const targetDb = getDb(savedMode);

        // Clear the mode-specific database first
        await apiRequest("DELETE", `/api/${savedMode}/reset`, undefined);

        // Restore cables and circuits to the correct mode's database
        await targetDb.cables.bulkAdd(projectData.cables);
        await targetDb.circuits.bulkAdd(projectData.circuits);

        // Invalidate mode-specific queries to refresh the UI
        queryClient.invalidateQueries({ queryKey: [`/api/${savedMode}/cables`] });
        queryClient.invalidateQueries({ queryKey: [`/api/${savedMode}/circuits`] });

        toast({
          title: "Project loaded successfully",
          description: `${projectData.cables.length} cable(s) and ${projectData.circuits.length} circuit(s) restored to ${savedMode} mode`
        });
      } catch (error) {
        console.error("Load error:", error);
        toast({ title: "Failed to load project file", variant: "destructive" });
      }
    };
    input.click();
  };

  const handleCableSubmit = (data: InsertCable) => {
    if (editingCable) {
      updateCableMutation.mutate({ id: editingCable.id, data });
    } else if (contextCableId && data.type === "Distribution") {
      // In sub-splice context: only distribution cables belong to this context
      createCableMutation.mutate({ ...data, parentCableId: contextCableId });
    } else {
      createCableMutation.mutate(data);
    }
  };


  const splicedCircuits = useMemo(() => {
    return allCircuits.filter((circuit) => {
      const cable = contextCables.find(c => c.id === circuit.cableId);
      if (!cable) return false;
      // In sub-splice context, context cable is treated as feed; exclude it
      if (contextCableId !== null && cable.id === contextCableId) return false;
      return circuit.isSpliced === 1 && cable.type === "Distribution";
    });
  }, [allCircuits, contextCables, contextCableId]);

  // Distribution cables in current context (excludes the context cable itself)
  const distributionCables = useMemo(() => {
    return contextCables.filter(c => {
      if (contextCableId !== null && c.id === contextCableId) return false;
      return c.type === "Distribution";
    });
  }, [contextCables, contextCableId]);

  // Feed cables in current context
  const feedCables = useMemo(() => {
    if (contextCableId !== null) {
      const contextCable = cables.find(c => c.id === contextCableId);
      return contextCable ? [contextCable] : [];
    }
    return contextCables.filter(c => c.type === "Feed");
  }, [contextCables, contextCableId, cables]);

  const selectedCable = cables.find((c) => c.id === selectedCableId);

  // In a sub-splice context, the distribution cable acting as feed is displayed as "f1"
  const displayName = (cable: Cable) =>
    contextCableId !== null && cable.id === contextCableId ? "f1" : cable.name;

  // 25-pair copper cable color codes (tip/ring combinations with actual color values)
  const pairColors = [
    { pair: 1, tip: "white", ring: "blue", tipColor: "#f1f5f9", ringColor: "#3b82f6", textColor: "#ffffff" },
    { pair: 2, tip: "white", ring: "orange", tipColor: "#f1f5f9", ringColor: "#f97316", textColor: "#ffffff" },
    { pair: 3, tip: "white", ring: "green", tipColor: "#f1f5f9", ringColor: "#16a34a", textColor: "#ffffff" },
    { pair: 4, tip: "white", ring: "brown", tipColor: "#f1f5f9", ringColor: "#b45309", textColor: "#ffffff" },
    { pair: 5, tip: "white", ring: "slate", tipColor: "#f1f5f9", ringColor: "#64748b", textColor: "#ffffff" },
    { pair: 6, tip: "red", ring: "blue", tipColor: "#dc2626", ringColor: "#3b82f6", textColor: "#ffffff" },
    { pair: 7, tip: "red", ring: "orange", tipColor: "#dc2626", ringColor: "#f97316", textColor: "#ffffff" },
    { pair: 8, tip: "red", ring: "green", tipColor: "#dc2626", ringColor: "#16a34a", textColor: "#ffffff" },
    { pair: 9, tip: "red", ring: "brown", tipColor: "#dc2626", ringColor: "#b45309", textColor: "#ffffff" },
    { pair: 10, tip: "red", ring: "slate", tipColor: "#dc2626", ringColor: "#64748b", textColor: "#ffffff" },
    { pair: 11, tip: "black", ring: "blue", tipColor: "#0f172a", ringColor: "#3b82f6", textColor: "#ffffff" },
    { pair: 12, tip: "black", ring: "orange", tipColor: "#0f172a", ringColor: "#f97316", textColor: "#ffffff" },
    { pair: 13, tip: "black", ring: "green", tipColor: "#0f172a", ringColor: "#16a34a", textColor: "#ffffff" },
    { pair: 14, tip: "black", ring: "brown", tipColor: "#0f172a", ringColor: "#b45309", textColor: "#ffffff" },
    { pair: 15, tip: "black", ring: "slate", tipColor: "#0f172a", ringColor: "#64748b", textColor: "#ffffff" },
    { pair: 16, tip: "yellow", ring: "blue", tipColor: "#facc15", ringColor: "#3b82f6", textColor: "#ffffff" },
    { pair: 17, tip: "yellow", ring: "orange", tipColor: "#facc15", ringColor: "#f97316", textColor: "#ffffff" },
    { pair: 18, tip: "yellow", ring: "green", tipColor: "#facc15", ringColor: "#16a34a", textColor: "#ffffff" },
    { pair: 19, tip: "yellow", ring: "brown", tipColor: "#facc15", ringColor: "#b45309", textColor: "#ffffff" },
    { pair: 20, tip: "yellow", ring: "slate", tipColor: "#facc15", ringColor: "#64748b", textColor: "#ffffff" },
    { pair: 21, tip: "violet", ring: "blue", tipColor: "#9333ea", ringColor: "#3b82f6", textColor: "#ffffff" },
    { pair: 22, tip: "violet", ring: "orange", tipColor: "#9333ea", ringColor: "#f97316", textColor: "#ffffff" },
    { pair: 23, tip: "violet", ring: "green", tipColor: "#9333ea", ringColor: "#16a34a", textColor: "#ffffff" },
    { pair: 24, tip: "violet", ring: "brown", tipColor: "#9333ea", ringColor: "#b45309", textColor: "#ffffff" },
    { pair: 25, tip: "violet", ring: "slate", tipColor: "#9333ea", ringColor: "#64748b", textColor: "#ffffff" },
  ];

  const binderSize = 25;
  const getBinderNumber = (pair: number) => Math.ceil(pair / binderSize);
  const getPairPositionInBinder = (pair: number) => ((pair - 1) % binderSize) + 1;
  const getColorForPair = (pairNum: number) => pairColors[(pairNum - 1) % 25];
  const getColorForBinder = (binder: number) => pairColors[(binder - 1) % 25];

  const makeGradient = (color: typeof pairColors[number]) => ({
    background: `linear-gradient(to right,
      ${color.tipColor} 0%,
      ${color.tipColor} 20%,
      ${color.ringColor} 20%,
      ${color.ringColor} 80%,
      ${color.tipColor} 80%,
      ${color.tipColor} 100%)`,
    color: color.textColor
  });

  // Helper to extract range start from circuit ID
  const getRangeStart = (circuitId: string): number => {
    const parts = circuitId.split(',');
    if (parts.length < 2) return 0;
    const rangePart = parts[1]?.trim() || '';
    const rangeParts = rangePart.split('-');
    return parseInt(rangeParts[0]?.trim() || '0') || 0;
  };

  // Render splice table for a list of spliced circuits
  const renderSpliceTable = (splicedCircuitsList: Circuit[], tableIdPrefix: string, feedLabel: string = "Feed") => {
    // Calculate total splice rows based on current view mode
    const totalSpliceRows = useBinderView
      ? splicedCircuitsList.reduce((sum, circuit) => {
          const pairCount = circuit.fiberEnd - circuit.fiberStart + 1;
          return sum + (pairCount / 25);
        }, 0)
      : splicedCircuitsList.reduce((sum, circuit) => {
          return sum + (circuit.fiberEnd - circuit.fiberStart + 1);
        }, 0);

    return (
      <div className="w-full max-w-full overflow-x-auto rounded-md border">
        <Table className="min-w-max text-sm">
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead rowSpan={3} className="text-center font-semibold py-1 px-2 whitespace-nowrap align-middle">#</TableHead>
              <TableHead colSpan={useBinderView ? 2 : 3} rowSpan={2} className="text-center font-semibold bg-green-100 dark:bg-green-950/50 py-1 px-2 align-middle">{feedLabel}</TableHead>
              <TableHead className="text-center py-1 px-2">
                <div className="flex items-center justify-center gap-1">
                  <Label htmlFor={`view-toggle-${tableIdPrefix}`} className="text-xs text-muted-foreground">Pairs</Label>
                  <Switch
                    id={`view-toggle-${tableIdPrefix}`}
                    checked={useBinderView}
                    onCheckedChange={setUseBinderView}
                    data-testid={`switch-view-mode-${tableIdPrefix}`}
                    className="scale-75"
                  />
                  <Label htmlFor={`view-toggle-${tableIdPrefix}`} className="text-xs text-muted-foreground">Binders</Label>
                </div>
              </TableHead>
              <TableHead colSpan={useBinderView ? 2 : 3} rowSpan={2} className="text-center font-semibold bg-blue-100 dark:bg-blue-950/50 py-1 px-2 align-middle">Distribution</TableHead>
            </TableRow>
            <TableRow className="bg-muted/50">
              <TableHead className="text-center font-semibold py-1 px-2 whitespace-nowrap">Splices : {totalSpliceRows}</TableHead>
            </TableRow>
            <TableRow>
              <TableHead className="text-center py-1 px-2 whitespace-nowrap">Cable</TableHead>
              <TableHead className="text-center py-1 px-2 whitespace-nowrap">Binder</TableHead>
              {!useBinderView && <TableHead className="text-center py-1 px-2 whitespace-nowrap">Pair</TableHead>}
              <TableHead className="text-center py-1 px-2 whitespace-nowrap">Circuit</TableHead>
              {!useBinderView && <TableHead className="text-center py-1 px-2 whitespace-nowrap">Pair</TableHead>}
              <TableHead className="text-center py-1 px-2 whitespace-nowrap">Binder</TableHead>
              <TableHead className="text-center py-1 px-2 whitespace-nowrap">Cable</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(() => {
              let rowNumber = 0;
              return splicedCircuitsList.flatMap((circuit, circuitIndex) => {
                const distributionCable = cables.find((c) => c.id === circuit.cableId);
                const feedCable = circuit.feedCableId ? cables.find((c) => c.id === circuit.feedCableId) : undefined;

                // Alternate background color based on circuit index
                const rowBgColor = circuitIndex % 2 === 0
                  ? "bg-white dark:bg-background"
                  : "bg-gray-200 dark:bg-muted/50";

                if (!feedCable) {
                  rowNumber++;
                  return [(
                    <TableRow key={circuit.id} className={rowBgColor} data-testid={`row-spliced-circuit-${circuit.id}`}>
                      <TableCell className="text-center font-mono py-1 px-2">{rowNumber}</TableCell>
                      <TableCell colSpan={useBinderView ? 4 : 6} className="text-center text-muted-foreground">
                        Circuit {circuit.circuitId} in {distributionCable?.name} - No feed cable selected. Please re-check the circuit.
                      </TableCell>
                    </TableRow>
                  )];
                }

                // Parse circuit ID to get the circuit numbers
                const circuitIdParts = circuit.circuitId.split(',');
                const circuitPrefix = circuitIdParts[0] || "";
                const circuitRange = circuitIdParts[1] || "";
                const rangeParts = circuitRange.split('-');

                // Safety check for valid circuit ID format
                if (rangeParts.length !== 2 || !rangeParts[0] || !rangeParts[1]) {
                  rowNumber++;
                  return [(
                    <TableRow key={circuit.id} className={rowBgColor} data-testid={`row-spliced-circuit-${circuit.id}`}>
                      <TableCell className="text-center font-mono py-1 px-2">{rowNumber}</TableCell>
                      <TableCell colSpan={useBinderView ? 4 : 6} className="text-center text-muted-foreground">
                        Circuit {circuit.circuitId} in {distributionCable?.name} - Invalid circuit ID format.
                      </TableCell>
                    </TableRow>
                  )];
                }

                const rangeStart = parseInt(rangeParts[0].trim());
                const rangeEnd = parseInt(rangeParts[1].trim());

                // Safety check for valid numbers
                if (isNaN(rangeStart) || isNaN(rangeEnd)) {
                  rowNumber++;
                  return [(
                    <TableRow key={circuit.id} className={rowBgColor} data-testid={`row-spliced-circuit-${circuit.id}`}>
                      <TableCell className="text-center font-mono py-1 px-2">{rowNumber}</TableCell>
                      <TableCell colSpan={useBinderView ? 4 : 6} className="text-center text-muted-foreground">
                        Circuit {circuit.circuitId} in {distributionCable?.name} - Invalid circuit number range.
                      </TableCell>
                    </TableRow>
                  )];
                }

                if (useBinderView) {
                  // Full binder view: show based on actual pair positions
                  const binderRows: JSX.Element[] = [];

                  const distPairStart = circuit.fiberStart;
                  const distPairEnd = circuit.fiberEnd;
                  const feedPairStart = circuit.feedFiberStart || circuit.fiberStart;
                  const feedPairEnd = circuit.feedFiberEnd || circuit.fiberEnd;

                  if (!distPairStart || !distPairEnd || !feedPairStart || !feedPairEnd ||
                      isNaN(distPairStart) || isNaN(distPairEnd) || isNaN(feedPairStart) || isNaN(feedPairEnd)) {
                    rowNumber++;
                    return [(
                      <TableRow key={circuit.id} className={rowBgColor} data-testid={`row-spliced-circuit-${circuit.id}`}>
                        <TableCell className="text-center font-mono py-1 px-2">{rowNumber}</TableCell>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          Circuit {circuit.circuitId} in {distributionCable?.name} - Invalid pair positions.
                        </TableCell>
                      </TableRow>
                    )];
                  }

                  let currentDistPair = distPairStart;
                  let currentFeedPair = feedPairStart;

                  while (currentDistPair <= distPairEnd) {
                    const currentDistBinder = getBinderNumber(currentDistPair);
                    const currentFeedBinder = getBinderNumber(currentFeedPair);

                    const distBinderEnd = currentDistBinder * binderSize;
                    const distSegmentEnd = Math.min(distBinderEnd, distPairEnd);
                    const feedBinderEnd = currentFeedBinder * binderSize;
                    const feedSegmentEnd = Math.min(feedBinderEnd, feedPairEnd);

                    const distPairCount = distSegmentEnd - currentDistPair + 1;
                    const feedPairCount = feedSegmentEnd - currentFeedPair + 1;
                    const segmentPairCount = Math.min(distPairCount, feedPairCount);

                    const pairOffset = currentDistPair - distPairStart;
                    const circuitStart = rangeStart + pairOffset;
                    const circuitEnd = circuitStart + segmentPairCount - 1;

                    const distPairPosStart = getPairPositionInBinder(currentDistPair);
                    const distPairPosEnd = getPairPositionInBinder(currentDistPair + segmentPairCount - 1);
                    const feedPairPosStart = getPairPositionInBinder(currentFeedPair);
                    const feedPairPosEnd = getPairPositionInBinder(currentFeedPair + segmentPairCount - 1);

                    const feedBinderColor = getColorForBinder(currentFeedBinder);
                    const distBinderColor = getColorForBinder(currentDistBinder);

                    rowNumber++;
                    binderRows.push(
                      <TableRow key={`${circuit.id}-segment-${currentDistPair}`} className={rowBgColor} data-testid={`row-binder-${circuit.id}-${currentDistPair}`}>
                        <TableCell className="text-center font-mono py-1 px-2">{rowNumber}</TableCell>
                        <TableCell className="text-center font-mono py-1 px-2 whitespace-nowrap">{displayName(feedCable)}-{feedCable.fiberCount}</TableCell>
                        <TableCell className="text-center font-mono font-semibold py-1 px-2 whitespace-nowrap">
                          <span className="inline-block px-2 py-0.5 rounded border-2 border-black font-mono font-semibold text-xs" style={makeGradient(feedBinderColor)}>
                            B{currentFeedBinder}
                          </span>
                          :
                          <span className="inline-block px-1.5 py-0.5 rounded border-2 border-black font-mono font-semibold text-xs ml-0.5" style={makeGradient(getColorForPair(feedPairPosStart))}>
                            {feedPairPosStart}
                          </span>
                          {feedPairPosStart !== feedPairPosEnd && <>
                            -
                            <span className="inline-block px-1.5 py-0.5 rounded border-2 border-black font-mono font-semibold text-xs" style={makeGradient(getColorForPair(feedPairPosEnd))}>
                              {feedPairPosEnd}
                            </span>
                          </>}
                        </TableCell>
                        <TableCell className="text-center font-mono font-semibold py-1 px-2 whitespace-nowrap">{circuitPrefix},{circuitStart}-{circuitEnd}</TableCell>
                        <TableCell className="text-center font-mono font-semibold py-1 px-2 whitespace-nowrap">
                          <span className="inline-block px-2 py-0.5 rounded border-2 border-black font-mono font-semibold text-xs" style={makeGradient(distBinderColor)}>
                            B{currentDistBinder}
                          </span>
                          :
                          <span className="inline-block px-1.5 py-0.5 rounded border-2 border-black font-mono font-semibold text-xs ml-0.5" style={makeGradient(getColorForPair(distPairPosStart))}>
                            {distPairPosStart}
                          </span>
                          {distPairPosStart !== distPairPosEnd && <>
                            -
                            <span className="inline-block px-1.5 py-0.5 rounded border-2 border-black font-mono font-semibold text-xs" style={makeGradient(getColorForPair(distPairPosEnd))}>
                              {distPairPosEnd}
                            </span>
                          </>}
                        </TableCell>
                        <TableCell className="text-center font-mono py-1 px-2 whitespace-nowrap">{distributionCable?.name}-{distributionCable?.fiberCount}</TableCell>
                      </TableRow>
                    );

                    currentDistPair += segmentPairCount;
                    currentFeedPair += segmentPairCount;
                  }

                  return binderRows;
                } else {
                  // Pair view: show one row per pair
                  const pairRows: JSX.Element[] = [];

                  if (!circuit.fiberStart || !circuit.fiberEnd || isNaN(circuit.fiberStart) || isNaN(circuit.fiberEnd)) {
                    rowNumber++;
                    return [(
                      <TableRow key={circuit.id} className={rowBgColor} data-testid={`row-spliced-circuit-${circuit.id}`}>
                        <TableCell className="text-center font-mono py-1 px-2">{rowNumber}</TableCell>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          Circuit {circuit.circuitId} in {distributionCable?.name} - Invalid pair positions.
                        </TableCell>
                      </TableRow>
                    )];
                  }

                  for (let i = 0; i < circuit.fiberEnd - circuit.fiberStart + 1; i++) {
                    const distPair = circuit.fiberStart + i;
                    const feedPair = (circuit.feedFiberStart || circuit.fiberStart) + i;

                    const distBinder = getBinderNumber(distPair);
                    const distPairInBinder = getPairPositionInBinder(distPair);
                    const feedBinder = getBinderNumber(feedPair);
                    const feedPairInBinder = getPairPositionInBinder(feedPair);

                    const circuitNumber = rangeStart + i;
                    const feedColor = getColorForPair(feedPairInBinder);
                    const distColor = getColorForPair(distPairInBinder);
                    const feedBinderColor = getColorForBinder(feedBinder);
                    const distBinderColor = getColorForBinder(distBinder);

                    rowNumber++;
                    pairRows.push(
                      <TableRow key={`${circuit.id}-pair-${i}`} className={rowBgColor} data-testid={`row-pair-${circuit.id}-${i}`}>
                        <TableCell className="text-center font-mono py-1 px-2">{rowNumber}</TableCell>
                        <TableCell className="text-center font-mono py-1 px-2 whitespace-nowrap">{displayName(feedCable)}-{feedCable.fiberCount}</TableCell>
                        <TableCell className="text-center font-mono font-semibold py-1 px-2 whitespace-nowrap">
                          <span className="inline-block px-2 py-0.5 rounded border-2 border-black font-mono font-semibold text-xs" style={makeGradient(feedBinderColor)}>
                            B{feedBinder}
                          </span>
                        </TableCell>
                        <TableCell className="text-center py-1 px-2">
                          <div className="inline-block px-3 py-1 rounded border-2 border-black font-mono font-semibold" style={makeGradient(feedColor)}>
                            {feedPairInBinder}
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-mono font-semibold py-1 px-2 whitespace-nowrap">{circuitPrefix},{circuitNumber}</TableCell>
                        <TableCell className="text-center py-1 px-2">
                          <div className="inline-block px-3 py-1 rounded border-2 border-black font-mono font-semibold" style={makeGradient(distColor)}>
                            {distPairInBinder}
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-mono font-semibold py-1 px-2 whitespace-nowrap">
                          <span className="inline-block px-2 py-0.5 rounded border-2 border-black font-mono font-semibold text-xs" style={makeGradient(distBinderColor)}>
                            B{distBinder}
                          </span>
                        </TableCell>
                        <TableCell className="text-center font-mono py-1 px-2 whitespace-nowrap">{distributionCable?.name}-{distributionCable?.fiberCount}</TableCell>
                      </TableRow>
                    );
                  }

                  return pairRows;
                }
              });
            })()}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <TutorialCursor x={cursorPos.x} y={cursorPos.y} visible={cursorPos.visible} clicking={cursorPos.clicking} />
      <header className="border-b">
        <div className="mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold">Copper Splice Manager</h1>
            </div>
            <HelpTip text="Switch between fiber optic and copper cable splicing modes." enabled={helpMode} side="bottom">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Phone className={mode === "copper" ? "h-4 w-4 text-primary" : "h-4 w-4 text-muted-foreground"} />
                  <Label htmlFor="mode-toggle" className="cursor-pointer text-sm font-medium">
                    Copper
                  </Label>
                </div>
                <ToggleSwitch
                  id="mode-toggle"
                  checked={mode === "fiber"}
                  onCheckedChange={(checked) => setMode(checked ? "fiber" : "copper")}
                />
                <div className="flex items-center gap-2">
                  <Label htmlFor="mode-toggle" className="cursor-pointer text-sm font-medium">
                    Fiber
                  </Label>
                  <Sparkles className={mode === "fiber" ? "h-4 w-4 text-primary" : "h-4 w-4 text-muted-foreground"} />
                </div>
              </div>
            </HelpTip>
            <div className="flex items-center gap-2">
              <HelpTip text="Run an interactive tutorial that demonstrates how to use the app step by step with copper cables." enabled={helpMode || !tutorialRunning} side="bottom">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (tutorialRunning) {
                      tutorialAbortRef.current?.abort();
                      return;
                    }
                    setTutorialDialogOpen(true);
                  }}
                  className={tutorialRunning ? "animate-pulse" : ""}
                >
                  <Play className="h-4 w-4 mr-1" />
                  {tutorialRunning ? "Stop" : "Tutorial"}
                </Button>
              </HelpTip>
              <HelpTip text={helpMode ? "Help mode is ON. Hover over any component to see what it does. Click to turn off." : "Turn on Help mode to see descriptions of each component when you hover over them."} enabled={true} side="bottom">
                <button
                  id="help-toggle"
                  role="switch"
                  aria-checked={helpMode}
                  onClick={() => setHelpMode(!helpMode)}
                  className={`relative inline-flex h-7 w-16 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${helpMode ? "bg-primary" : "bg-input"}`}
                >
                  <span className={`pointer-events-none absolute inset-0 flex items-center text-[10px] font-semibold transition-opacity ${helpMode ? "justify-start pl-2 text-primary-foreground opacity-100" : "opacity-0"}`}>
                    Help
                  </span>
                  <span className={`pointer-events-none absolute inset-0 flex items-center text-[10px] font-semibold transition-opacity ${!helpMode ? "justify-end pr-1.5 text-muted-foreground opacity-100" : "opacity-0"}`}>
                    Help
                  </span>
                  <span className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${helpMode ? "translate-x-9" : "translate-x-0.5"}`} />
                </button>
              </HelpTip>
              <HelpTip text="Load a previously saved splice project from a JSON file." enabled={helpMode} side="bottom">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoad}
                  data-testid="button-load"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Load
                </Button>
              </HelpTip>
              <HelpTip text="Save your current splice project to a JSON file for later use." enabled={helpMode} side="bottom">
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSaveClick}
                  data-testid="button-save"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
              </HelpTip>
              <UndoButton
                mode={mode}
                helpMode={helpMode}
                onUndo={() => {
                  setMainSpliceName(localStorage.getItem(`spliceName-${mode}`) ?? "Main");
                  setSelectedCableId(null);
                }}
              />
              <HistoryButton
                mode={mode}
                helpMode={helpMode}
                onRestore={() => {
                  setMainSpliceName(localStorage.getItem(`spliceName-${mode}`) ?? "Main");
                  setSelectedCableId(null);
                }}
              />
              <HelpTip text="Clear all cables and circuits to start fresh." enabled={helpMode} side="bottom">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setResetDialogOpen(true)}
                  data-testid="button-reset"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset
                </Button>
              </HelpTip>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto px-4 py-6">

        {/* Splice Tree — always visible above tabs */}
        {cables.length > 0 && (
          <HelpTip text="Visual diagram of the cable hierarchy. Feed cables connect to distribution cables. Click a node to navigate to that splice." enabled={helpMode} side="bottom">
            <Collapsible
              open={spliceTreeOpen}
              onOpenChange={(open) => {
                setSpliceTreeOpen(open);
                localStorage.setItem(`spliceTreeOpen-${mode}`, String(open));
              }}
              className="mb-6 border rounded-lg p-4 bg-muted/30"
            >
              <CollapsibleTrigger className="flex items-center gap-1 w-full text-left text-base font-bold text-foreground mb-1 border-b pb-2 hover:text-primary transition-colors">
                <ChevronDown className={`h-4 w-4 transition-transform ${spliceTreeOpen ? '' : '-rotate-90'}`} />
                Splice Tree
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SpliceTree
                  cables={cables}
                  circuits={allCircuits}
                  selectedCableId={
                    selectedCable?.type === "Feed"
                      ? selectedCableId
                      : contextCableId === null
                        ? (cables.find(c => c.type === "Feed")?.id ?? null)
                        : null
                  }
                  contextCableId={contextCableId}
                  mainSpliceName={mainSpliceName}
                  onNodeClick={handleTreeNodeClick}
                  onAddSplice={(cable) => {
                    setPendingSpliceContextCable(cable);
                    setSpliceNamingInput(cable.spliceName ?? "");
                    setSpliceNamingContext("sub");
                    setSpliceNamingDialogOpen(true);
                  }}
                />
              </CollapsibleContent>
            </Collapsible>
          </HelpTip>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* Splice navigation panel — bordered like Splice Tree */}
          <div className="mb-6 border rounded-lg p-4 bg-muted/30">
            {/* Splice name title — styled like Splice Tree header */}
            {cables.length > 0 && (
              <div className="w-full mb-1 border-b pb-2">
                {contextCableId === null ? (
                  <div className="flex items-center gap-1">
                    {editingMainSpliceName ? (
                      <>
                        <Input
                          value={tempMainSpliceName}
                          onChange={e => setTempMainSpliceName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              const name = tempMainSpliceName.trim() || "Main Splice";
                              localStorage.setItem(`spliceName-${mode}`, name);
                              setMainSpliceName(name);
                              setEditingMainSpliceName(false);
                            }
                            if (e.key === "Escape") setEditingMainSpliceName(false);
                          }}
                          className="h-7 w-48 text-base font-bold"
                          autoFocus
                        />
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                          onClick={() => {
                            const name = tempMainSpliceName.trim() || "Main Splice";
                            localStorage.setItem(`spliceName-${mode}`, name);
                            setMainSpliceName(name);
                            setEditingMainSpliceName(false);
                          }}>
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                          onClick={() => setEditingMainSpliceName(false)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </>
                    ) : (
                      <HelpTip text="The name of this splice. Click to rename it." enabled={helpMode} side="bottom">
                        <button
                          className="flex items-center gap-1.5 text-base font-bold text-foreground hover:text-primary transition-colors group"
                          onClick={() => {
                            setTempMainSpliceName(mainSpliceName);
                            setEditingMainSpliceName(true);
                          }}
                        >
                          {(mainSpliceName || "Main") + " Splice"}
                          <Edit2 className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                        </button>
                      </HelpTip>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    {(() => {
                      const contextCable = cables.find(c => c.id === contextCableId);
                      const currentName = contextCable?.spliceName ?? contextCable?.name ?? "Splice";
                      return (
                        <button
                          className="flex items-center gap-1.5 text-base font-bold text-foreground hover:text-primary transition-colors group"
                          onClick={() => {
                            if (!contextCable) return;
                            setPendingSpliceContextCable(contextCable);
                            setSpliceNamingInput(contextCable.spliceName ?? "");
                            setSpliceNamingContext("sub");
                            setSpliceNamingDialogOpen(true);
                          }}
                        >
                          {currentName + " Splice"}
                          <Edit2 className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                        </button>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
            {/* Tab Navigation */}
            <TabsList data-testid="tabs-main" className="w-full justify-start bg-transparent p-0">
              {/* Cables Section - No Header */}
              <div className="inline-flex flex-col">
                <div className="h-6 mb-2"></div>
                <HelpTip text="View and manage all cables in this splice. Add feed and distribution cables here." enabled={helpMode} side="bottom">
                  <TabsTrigger value="input" data-testid="tab-input-data">
                    <CableIcon className="h-4 w-4 mr-2" />
                    Cables
                  </TabsTrigger>
                </HelpTip>
              </div>

              {/* ID Splice Section with Header */}
              {(() => {
                const uniquePrefixes = new Set<string>();
                splicedCircuits.forEach(circuit => {
                  const parts = circuit.circuitId.split(',');
                  const prefix = parts[0]?.trim();
                  if (prefix) uniquePrefixes.add(prefix);
                });
                const prefixArray = Array.from(uniquePrefixes).sort();
                if (prefixArray.length === 0) return null;

                return (
                  <>
                    <div className="h-8 w-0.5 bg-border mx-3 self-end" />
                    <HelpTip text="View splice details grouped by circuit ID prefix. Each tab shows circuits sharing the same prefix." enabled={helpMode} side="bottom">
                      <div className="inline-flex flex-col">
                        <div className="text-center border-x-2 border-border bg-muted/30 px-6 py-1 rounded-t mb-2">
                          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                            Splice by ID
                          </h3>
                        </div>
                        <div className="inline-flex">
                          {prefixArray.map(prefix => (
                            <TabsTrigger
                              key={`prefix-${prefix}`}
                              value={`prefix-splice-${prefix}`}
                              data-testid={`tab-prefix-splice-${prefix}`}
                            >
                              <Layers className="h-4 w-4 mr-2" />
                              {prefix}
                            </TabsTrigger>
                          ))}
                        </div>
                      </div>
                    </HelpTip>
                  </>
                );
              })()}

              {/* Cable Splice Section with Header */}
              {(distributionCables.length > 0 || feedCables.length > 0) && (
                <>
                  <div className="h-8 w-0.5 bg-border mx-3 self-end" />
                  <HelpTip text="View splice details organized by cable. Each tab shows the splice mapping for a specific distribution cable." enabled={helpMode} side="bottom">
                    <div className="inline-flex flex-col">
                      <div className="text-center border-x-2 border-border bg-muted/30 px-6 py-1 rounded-t mb-2">
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                          Splice by Cable
                        </h3>
                      </div>
                    <div className="inline-flex">
                      {distributionCables.map((distCable) => {
                          const parentCable = distCable.parentCableId
                            ? cables.find(c => c.id === distCable.parentCableId)
                            : null;
                          return (
                            <TabsTrigger
                              key={distCable.id}
                              value={`splice-${distCable.id}`}
                              data-testid={`tab-splice-${distCable.id}`}
                            >
                              <CableIcon className="h-4 w-4 mr-2" />
                              {distCable.name}
                            </TabsTrigger>
                          );
                        })}
                      {feedCables.filter(() => contextCableId === null).map((feedCable) => (
                        <TabsTrigger
                          key={`feed-${feedCable.id}`}
                          value={`feed-splice-${feedCable.id}`}
                          data-testid={`tab-feed-splice-${feedCable.id}`}
                        >
                          <CableIcon className="h-4 w-4 mr-2" />
                          {displayName(feedCable)}
                        </TabsTrigger>
                      ))}
                    </div>
                  </div>
                  </HelpTip>
                </>
              )}
            </TabsList>
          </div>

          <TabsContent value="input" className="space-y-4">
            <div className="border rounded-lg p-4 bg-muted/30">
              <div className="flex flex-wrap items-start gap-2">
                {cablesLoading ? (
                  <div className="text-muted-foreground">Loading cables...</div>
                ) : sortedCables.length === 0 ? (
                  <div className="text-muted-foreground" data-testid="text-no-cables">
                    No cables yet. Add a cable to get started.
                  </div>
                ) : (
                  sortedCables.map((cable) => {
                    const cableCircuits = allCircuits.filter(c => c.cableId === cable.id);
                    const totalPairs = cableCircuits.reduce((sum, c) => sum + (c.fiberEnd - c.fiberStart + 1), 0);
                    const isValid = totalPairs === cable.fiberCount;
                    const isContextFeedCable = contextCableId !== null && cable.id === contextCableId;
                    const typeColorClass = (cable.type === "Feed" || isContextFeedCable)
                      ? "bg-green-100 dark:bg-green-950/50 hover:bg-green-200 dark:hover:bg-green-900/50"
                      : "bg-blue-100 dark:bg-blue-950/50 hover:bg-blue-200 dark:hover:bg-blue-900/50";
                    return (
                      <div key={cable.id} className="flex flex-col gap-0.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCableSelect(cable.id)}
                          className={`flex items-center gap-2 ${typeColorClass} ${selectedCableId === cable.id ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
                          data-testid={`button-cable-${cable.id}`}
                        >
                          <CableIcon className="h-4 w-4" />
                          <span>{displayName(cable)}</span>
                          <span className="text-xs opacity-70">({cable.fiberCount})</span>
                          <span className={`ml-1 text-xs px-1.5 py-0.5 rounded ${isValid ? 'bg-green-500/20 text-green-600 dark:text-green-400' : 'bg-red-500/20 text-red-600 dark:text-red-400'}`}>
                            {isValid ? 'Pass' : 'Fail'}
                          </span>
                        </Button>
                        {cable.type === "Distribution" && cable.id !== contextCableId && (
                          <HelpTip text="Create a sub-splice from this distribution cable. The cable becomes the feed in the new splice." enabled={helpMode} side="bottom">
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-dashed text-xs h-7"
                              data-testid={`button-add-splice-${cable.id}`}
                              onClick={() => {
                                setPendingSpliceContextCable(cable);
                                setSpliceNamingInput(cable.spliceName ?? "");
                                setSpliceNamingContext("sub");
                                setSpliceNamingDialogOpen(true);
                              }}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Add Splice
                            </Button>
                          </HelpTip>
                        )}
                      </div>
                    );
                  })
                )}
                <HelpTip text="Add a new feed or distribution cable to this splice." enabled={helpMode} side="bottom">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setEditingCable(null); setCableDialogOpen(true); }}
                    data-testid="button-add-cable"
                    className="border-dashed"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Cable
                  </Button>
                </HelpTip>
              </div>
            </div>

              <div>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-4 py-3">
                    <HelpTip text="Details for the selected cable including type, pair count, and circuit assignments." enabled={helpMode} side="bottom">
                      <CardTitle className="text-base font-bold">
                        {selectedCable ? `Cable: ${displayName(selectedCable)}` : "Select a cable"}
                      </CardTitle>
                    </HelpTip>
                    {selectedCable && (
                      <div className="flex items-center gap-2">
                        <HelpTip text="Edit this cable's name, type, pair count, and other details." enabled={helpMode} side="bottom">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setEditingCable(selectedCable);
                              setCableDialogOpen(true);
                            }}
                            data-testid="button-edit-cable"
                          >
                            <Edit2 className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                        </HelpTip>
                        <HelpTip text="Permanently remove this cable and all its circuits." enabled={helpMode} side="bottom">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              deleteCableMutation.mutate(selectedCable.id);
                              setSelectedCableId(null);
                            }}
                            data-testid="button-delete-cable"
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Delete
                          </Button>
                        </HelpTip>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="pt-0 pb-3">
                    {selectedCable ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Type:</span>
                            {editingType ? (
                              <>
                                <select
                                  value={tempType}
                                  onChange={(e) => setTempType(e.target.value as "Feed" | "Distribution")}
                                  className="ml-2 px-2 py-1 border rounded text-sm"
                                  data-testid="select-edit-type"
                                  autoFocus
                                >
                                  <option value="Feed">Feed</option>
                                  <option value="Distribution">Distribution</option>
                                </select>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6"
                                  onClick={() => {
                                    updateCableMutation.mutate({
                                      id: selectedCable.id,
                                      data: {
                                        name: selectedCable.name,
                                        fiberCount: selectedCable.fiberCount,
                                        type: tempType,
                                      }
                                    });
                                    setEditingType(false);
                                  }}
                                  data-testid="button-save-type"
                                >
                                  <Check className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6"
                                  onClick={() => setEditingType(false)}
                                  data-testid="button-cancel-type"
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <span className="ml-2 font-medium">{selectedCable.type}</span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => {
                                    setTempType(selectedCable.type as "Feed" | "Distribution");
                                    setEditingType(true);
                                  }}
                                  data-testid="button-edit-type"
                                >
                                  <Edit2 className="h-3 w-3" />
                                </Button>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Cable Size:</span>
                            {editingSize ? (
                              <>
                                <input
                                  type="number"
                                  value={tempSize}
                                  onChange={(e) => setTempSize(parseInt(e.target.value) || 0)}
                                  className="ml-2 w-20 px-2 py-1 border rounded text-sm font-mono"
                                  data-testid="input-edit-size"
                                  autoFocus
                                  min="25"
                                  step="25"
                                />
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6"
                                  onClick={() => {
                                    updateCableMutation.mutate({
                                      id: selectedCable.id,
                                      data: {
                                        name: selectedCable.name,
                                        fiberCount: tempSize,
                                        type: selectedCable.type as "Feed" | "Distribution",
                                      }
                                    });
                                    setEditingSize(false);
                                  }}
                                  data-testid="button-save-size"
                                >
                                  <Check className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6"
                                  onClick={() => setEditingSize(false)}
                                  data-testid="button-cancel-size"
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <span className="ml-2 font-mono font-medium">{selectedCable.fiberCount}</span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => {
                                    setTempSize(selectedCable.fiberCount);
                                    setEditingSize(true);
                                  }}
                                  data-testid="button-edit-size"
                                >
                                  <Edit2 className="h-3 w-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>

                        <CircuitManagement cable={selectedCable} mode={mode} isContextFeed={contextCableId !== null && selectedCable?.id === contextCableId} helpMode={helpMode} />
                      </div>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        Select a cable from the list to view details
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
          </TabsContent>

          {/* Dynamic TabsContent for each unique circuit ID prefix - sorted by range */}
          {(() => {
            // Group all spliced circuits by their circuit ID prefix
            const groupedByPrefix: Record<string, Circuit[]> = {};
            splicedCircuits.forEach(circuit => {
              const parts = circuit.circuitId.split(',');
              const prefix = parts[0]?.trim() || 'Unknown';
              if (!groupedByPrefix[prefix]) {
                groupedByPrefix[prefix] = [];
              }
              groupedByPrefix[prefix].push(circuit);
            });

            const prefixes = Object.keys(groupedByPrefix).sort();

            return prefixes.map(prefix => {
              // Sort circuits by their range start number
              const prefixCircuits = [...groupedByPrefix[prefix]].sort((a, b) => {
                return getRangeStart(a.circuitId) - getRangeStart(b.circuitId);
              });

              return (
                <TabsContent key={`prefix-${prefix}`} value={`prefix-splice-${prefix}`}>
                  <Card>
                    <CardHeader>
                      <CardTitle>{prefix} Splice</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {prefixCircuits.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground" data-testid={`text-no-prefix-splices-${prefix}`}>
                          No circuits marked as spliced for {prefix}.
                        </div>
                      ) : (
                        renderSpliceTable(prefixCircuits, `prefix-${prefix}`)
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              );
            });
          })()}

          {distributionCables.map((distCable) => {
            const parentCable = distCable.parentCableId
              ? cables.find(c => c.id === distCable.parentCableId)
              : null;
            const cableSplicedCircuits = splicedCircuits.filter(c => c.cableId === distCable.id).sort((a, b) => {
              try {
                const partsA = parseCircuitIdParts(a.circuitId);
                const partsB = parseCircuitIdParts(b.circuitId);
                if (partsA.prefix !== partsB.prefix) return partsA.prefix.localeCompare(partsB.prefix);
                return partsA.rangeStart - partsB.rangeStart;
              } catch {
                return a.circuitId.localeCompare(b.circuitId);
              }
            });

            return (
              <TabsContent key={distCable.id} value={`splice-${distCable.id}`}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-bold">
                      Splice Mapping - {distCable.name}
                      {parentCable && (
                        <span className="ml-2 text-sm font-normal text-muted-foreground">(sub-splice from {displayName(parentCable)})</span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {circuitsLoading ? (
                      <div className="text-center py-12 text-muted-foreground">Loading circuits...</div>
                    ) : cableSplicedCircuits.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground" data-testid={`text-no-spliced-circuits-${distCable.id}`}>
                        No circuits marked as spliced yet for {distCable.name}. Select this cable in the Cables tab and mark circuits as spliced.
                      </div>
                    ) : (
                      renderSpliceTable(cableSplicedCircuits, `dist-${distCable.id}`, parentCable ? `Source (${displayName(parentCable)})` : "Feed")
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            );
          })}

          {/* Feed Cable Splice Tabs */}
          {feedCables.map((feedCable) => {
            // Get all Distribution circuits that are spliced to this Feed cable
            const feedSplicedCircuits = allCircuits.filter(c =>
              c.isSpliced === 1 && c.feedCableId === feedCable.id
            ).sort((a, b) => {
              // Sort by feedFiberStart position
              return (a.feedFiberStart || 0) - (b.feedFiberStart || 0);
            });

            return (
              <TabsContent key={`feed-${feedCable.id}`} value={`feed-splice-${feedCable.id}`}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-bold">Splice Mapping - {displayName(feedCable)}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {circuitsLoading ? (
                      <div className="text-center py-12 text-muted-foreground">Loading circuits...</div>
                    ) : feedSplicedCircuits.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground" data-testid={`text-no-feed-spliced-circuits-${feedCable.id}`}>
                        No Distribution circuits spliced to {displayName(feedCable)} yet. Check circuits in Distribution cables.
                      </div>
                    ) : (
                      renderSpliceTable(feedSplicedCircuits, `feed-${feedCable.id}`)
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            );
          })}
        </Tabs>
      </main>

      <Dialog open={cableDialogOpen} onOpenChange={(open) => {
        if (!open && cameraActiveRef.current) return;
        setCableDialogOpen(open);
        if (!open) {
          setEditingCable(null);
        }
      }}>
        <DialogContent
          data-testid="dialog-cable-form"
          onPointerDownOutside={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => { if (cameraActiveRef.current) e.preventDefault(); }}
        >
          <DialogHeader>
            <DialogTitle>
              {editingCable ? "Edit Cable" : "Add New Cable"}
            </DialogTitle>
            <DialogDescription>
              {editingCable
                ? "Update cable details and circuit information"
                : "Create a new cable with circuits for splicing"}
            </DialogDescription>
          </DialogHeader>
          <CableForm
            cable={editingCable || undefined}
            onSubmit={handleCableSubmit}
            onCancel={() => {
              setCableDialogOpen(false);
              setEditingCable(null);
            }}
            isLoading={createCableMutation.isPending || updateCableMutation.isPending}
            mode={mode}
            existingCables={cables}
            onTakePicture={handleTakePicture}
            cameraOcrImage={cameraOcrImage}
            onCameraOcrImageUsed={() => setCameraOcrImage("")}
          />
        </DialogContent>
      </Dialog>

      {/* Camera file input — lives at page level so it survives dialog lifecycle */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCameraFileChange}
        className="hidden"
      />

      <CropDialog
        open={cropDialogOpen}
        onOpenChange={setCropDialogOpen}
        imageSrc={cameraRawImage}
        onImageCropped={(croppedImage) => {
          setCameraOcrImage(croppedImage);
          setCropDialogOpen(false);
          setCameraRawImage("");
          setCableDialogOpen(true);
        }}
        onRetake={() => {
          setCropDialogOpen(false);
          setCameraRawImage("");
          setTimeout(() => cameraInputRef.current?.click(), 100);
        }}
      />

      {/* Splice Naming Dialog */}
      <Dialog open={spliceNamingDialogOpen} onOpenChange={(open) => {
        if (!open) {
          // If dismissing the main-splice dialog, still enter context for sub, or set a default name for main
          if (spliceNamingContext === "main") {
            const name = spliceNamingInput.trim() || "Main Splice";
            localStorage.setItem(`spliceName-${mode}`, name);
            setMainSpliceName(name);
          } else if (spliceNamingContext === "sub" && pendingSpliceContextCable) {
            // Enter context without renaming
            setContextCableId(pendingSpliceContextCable.id);
            setSelectedCableId(null);
            setActiveTab("input");
            setPendingSpliceContextCable(null);
          }
          setSpliceNamingDialogOpen(false);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {spliceNamingContext === "main" ? "Name Your Splice" : "Name This Splice"}
            </DialogTitle>
            <DialogDescription>
              {spliceNamingContext === "main"
                ? "Give this splice project a name. You can change it later by clicking the name."
                : `Enter a name for the splice on ${pendingSpliceContextCable?.name ?? "this cable"}. It will appear as the node label in the splice tree.`}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="e.g., Print 2.4"
              value={spliceNamingInput}
              onChange={e => setSpliceNamingInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  if (spliceNamingContext === "main") {
                    const name = spliceNamingInput.trim() || "Main Splice";
                    localStorage.setItem(`spliceName-${mode}`, name);
                    setMainSpliceName(name);
                    setSpliceNamingDialogOpen(false);
                  } else if (pendingSpliceContextCable) {
                    const name = spliceNamingInput.trim();
                    if (name) updateCableSpliceNameMutation.mutate({ id: pendingSpliceContextCable.id, spliceName: name });
                    setContextCableId(pendingSpliceContextCable.id);
                    setSelectedCableId(null);
                    setActiveTab("input");
                    setPendingSpliceContextCable(null);
                    setSpliceNamingDialogOpen(false);
                  }
                }
              }}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            {spliceNamingContext === "sub" && (
              <Button variant="outline" onClick={() => {
                // Skip naming — just enter context
                if (pendingSpliceContextCable) {
                  setContextCableId(pendingSpliceContextCable.id);
                  setSelectedCableId(null);
                  setActiveTab("input");
                  setPendingSpliceContextCable(null);
                }
                setSpliceNamingDialogOpen(false);
              }}>
                Skip
              </Button>
            )}
            <Button onClick={() => {
              if (spliceNamingContext === "main") {
                const name = spliceNamingInput.trim() || "Main Splice";
                localStorage.setItem(`spliceName-${mode}`, name);
                setMainSpliceName(name);
                setSpliceNamingDialogOpen(false);
              } else if (pendingSpliceContextCable) {
                const name = spliceNamingInput.trim();
                if (name) updateCableSpliceNameMutation.mutate({ id: pendingSpliceContextCable.id, spliceName: name });
                setContextCableId(pendingSpliceContextCable.id);
                setSelectedCableId(null);
                setActiveTab("input");
                setPendingSpliceContextCable(null);
                setSpliceNamingDialogOpen(false);
              }
            }}>
              {spliceNamingContext === "main" ? "Set Name" : "Name & Enter"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent data-testid="dialog-reset-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Reset All Data</AlertDialogTitle>
            <AlertDialogDescription>
              This will clear all cables and circuits without saving. You can use Undo afterward to restore the previous project state.
              Are you sure you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-reset-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => resetMutation.mutate()}
              data-testid="button-reset-confirm"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reset All Data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={tutorialDialogOpen} onOpenChange={setTutorialDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start Tutorial</AlertDialogTitle>
            <AlertDialogDescription>
              Running the tutorial will reset all current cables and circuits. Any unsaved data will be lost.
              Do you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setTutorialDialogOpen(false);
                const abortController = new AbortController();
                tutorialAbortRef.current = abortController;
                setTutorialRunning(true);
                try {
                  await runCopperTutorial({
                    setCursorPos,
                    showToast: (title, description) => toast({ title, description }),
                    mode,
                    signal: abortController.signal,
                  });
                } catch (err: any) {
                  if (err?.name === "AbortError" || abortController.signal.aborted) {
                    setCursorPos({ x: 0, y: 0, visible: false, clicking: false });
                    toast({ title: "Tutorial stopped" });
                  } else {
                    console.error("Tutorial error:", err);
                    toast({ title: "Tutorial error", variant: "destructive" });
                  }
                } finally {
                  setTutorialRunning(false);
                  tutorialAbortRef.current = null;
                }
              }}
            >
              Start Tutorial
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent data-testid="dialog-save-filename">
          <DialogHeader>
            <DialogTitle>Save Project</DialogTitle>
            <DialogDescription>
              Download your project as a JSON file to save your cables and circuits
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="filename" className="text-sm font-medium">
                Project Name (optional)
              </label>
              <Input
                id="filename"
                placeholder="e.g., Main Street Splice"
                value={saveFileName}
                onChange={(e) => setSaveFileName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveConfirm();
                  }
                }}
                data-testid="input-save-filename"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to use automatic timestamp
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setSaveDialogOpen(false);
                setSaveFileName("");
              }}
              data-testid="button-save-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveConfirm}
              data-testid="button-save-confirm"
            >
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
