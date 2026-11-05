import { Fragment, useState, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Circuit, Cable, InsertCircuit } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, CheckCircle2, XCircle, Edit2, Check, X, ChevronUp, ChevronDown, Scan, Camera, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OcrDialog } from "./OcrDialog";
import { CropDialog } from "./CameraCaptureDialog";
import { normalizeCircuitId } from "@/lib/circuitIdUtils";
import { HelpTip } from "@/components/HelpTip";
import { setCircuitSpliced } from "@/lib/spliceCircuit";

interface CircuitManagementProps {
  cable: Cable;
  mode?: "fiber" | "copper";
  isContextFeed?: boolean;
  helpMode?: boolean;
}

export function CircuitManagement({ cable, mode = "fiber", isContextFeed = false, helpMode = false }: CircuitManagementProps) {
  const { toast } = useToast();
  const [circuitId, setCircuitId] = useState("");
  const [editingCircuitId, setEditingCircuitId] = useState<string | null>(null);
  const [editingCircuitValue, setEditingCircuitValue] = useState("");
  const [insertAfterIndex, setInsertAfterIndex] = useState<number | null>(null);
  const [insertCircuitValue, setInsertCircuitValue] = useState("");
  const [circuitInputFocused, setCircuitInputFocused] = useState(false);
  const [ocrDialogOpen, setOcrDialogOpen] = useState(false);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cameraImage, setCameraImage] = useState<string>("");
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setCameraImage(reader.result as string);
      setCropDialogOpen(true);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const { data: circuits = [], isLoading } = useQuery<Circuit[]>({
    queryKey: [`/api/${mode}/circuits/cable`, cable.id],
  });

  const { data: allCables = [] } = useQuery<Cable[]>({
    queryKey: [`/api/${mode}/cables`],
  });

  const { data: allCircuits = [] } = useQuery<Circuit[]>({
    queryKey: [`/api/${mode}/circuits`],
  });

  const createCircuitMutation = useMutation({
    mutationFn: async (data: InsertCircuit & { insertAt?: number }) => {
      return await apiRequest("POST", `/api/${mode}/circuits`, data);
    },
    onSuccess: async () => {
      // Force refetch to update UI
      await queryClient.refetchQueries({ queryKey: [`/api/${mode}/circuits/cable`, cable.id] });
      await queryClient.refetchQueries({ queryKey: [`/api/${mode}/circuits`] });
      setCircuitId("");
      setInsertCircuitValue("");
      setInsertAfterIndex(null);
      toast({ title: "Circuit added successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to add circuit", 
        description: error.message || "Please check your input",
        variant: "destructive" 
      });
    },
  });

  const deleteCircuitMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/${mode}/circuits/${id}`, undefined);
    },
    onSuccess: async () => {
      // Force refetch to update UI
      await queryClient.refetchQueries({ queryKey: [`/api/${mode}/circuits/cable`, cable.id] });
      await queryClient.refetchQueries({ queryKey: [`/api/${mode}/circuits`] });
      toast({ title: "Circuit deleted successfully" });
    },
    onError: async (error: any) => {
      // If circuit doesn't exist (404), still remove from UI
      if (error?.message?.includes("not found") || error?.message?.includes("404")) {
        await queryClient.refetchQueries({ queryKey: [`/api/${mode}/circuits/cable`, cable.id] });
        await queryClient.refetchQueries({ queryKey: [`/api/${mode}/circuits`] });
        toast({ title: "Circuit removed from display" });
      } else {
        toast({ title: "Failed to delete circuit", variant: "destructive" });
      }
    },
  });

  const updateCircuitIdMutation = useMutation({
    mutationFn: async ({ id, circuitId }: { id: string; circuitId: string }) => {
      return await apiRequest("PATCH", `/api/${mode}/circuits/${id}/update-circuit-id`, { circuitId });
    },
    onSuccess: async () => {
      // Force refetch to update UI with recalculated fiber positions
      await queryClient.refetchQueries({ queryKey: [`/api/${mode}/circuits/cable`, cable.id] });
      await queryClient.refetchQueries({ queryKey: [`/api/${mode}/circuits`] });
      setEditingCircuitId(null);
      setEditingCircuitValue("");
      toast({ title: "Circuit ID updated successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update circuit ID", 
        description: error.message || "Please check your input",
        variant: "destructive" 
      });
    },
  });

  const moveCircuitMutation = useMutation({
    mutationFn: async ({ id, direction }: { id: string; direction: "up" | "down" }) => {
      return await apiRequest("PATCH", `/api/${mode}/circuits/${id}/move`, { direction });
    },
    onSuccess: async () => {
      // Force refetch to update UI with new positions and recalculated fiber positions
      await queryClient.refetchQueries({ queryKey: [`/api/${mode}/circuits/cable`, cable.id] });
      await queryClient.refetchQueries({ queryKey: [`/api/${mode}/circuits`] });
      toast({ title: "Circuit moved successfully" });
    },
    onError: () => {
      toast({ title: "Failed to move circuit", variant: "destructive" });
    },
  });

  const handleCheckboxChange = (circuit: Circuit, checked: boolean) => {
    return setCircuitSpliced({
      circuit,
      cable,
      checked,
      allCircuits,
      allCables,
      cableCircuits: circuits,
      mode,
    });
  };


  const handleStartEdit = (circuit: Circuit) => {
    setEditingCircuitId(circuit.id);
    setEditingCircuitValue(circuit.circuitId);
  };

  const handleCancelEdit = () => {
    setEditingCircuitId(null);
    setEditingCircuitValue("");
  };

  // Helper function to parse circuit ID and check for duplicates
  const parseAndCheckCircuitId = (newCircuitId: string, excludeCircuitId?: string) => {
    const parts = newCircuitId.split(',');
    if (parts.length !== 2) {
      return { valid: false, error: 'Invalid circuit ID format. Expected format: "prefix,start-end"' };
    }
    
    const newPrefix = parts[0].trim();
    const newRange = parts[1].trim();
    const newRangeParts = newRange.split('-');
    
    if (newRangeParts.length !== 2) {
      return { valid: false, error: 'Invalid range format. Expected format: "start-end"' };
    }
    
    const newStart = parseInt(newRangeParts[0]);
    const newEnd = parseInt(newRangeParts[1]);
    
    if (isNaN(newStart) || isNaN(newEnd)) {
      return { valid: false, error: 'Range values must be numbers' };
    }
    
    // Check for overlap with existing circuits
    for (const circuit of circuits) {
      if (excludeCircuitId && circuit.id === excludeCircuitId) continue;
      
      const existingParts = circuit.circuitId.split(',');
      if (existingParts.length !== 2) continue;
      
      const existingPrefix = existingParts[0].trim();
      const existingRange = existingParts[1].trim();
      const existingRangeParts = existingRange.split('-');
      
      if (existingRangeParts.length !== 2) continue;
      
      const existingStart = parseInt(existingRangeParts[0]);
      const existingEnd = parseInt(existingRangeParts[1]);
      
      if (isNaN(existingStart) || isNaN(existingEnd)) continue;
      
      // Check if same prefix (case-insensitive: "LG52" and "lg52" are the same)
      if (newPrefix.toLowerCase() === existingPrefix.toLowerCase()) {
        // Check for overlap: ranges overlap if newStart <= existingEnd AND newEnd >= existingStart
        if (newStart <= existingEnd && newEnd >= existingStart) {
          return { 
            valid: false, 
            error: `Circuit ID "${newCircuitId}" overlaps with existing circuit "${circuit.circuitId}". Ranges cannot overlap for the same prefix.` 
          };
        }
      }
    }
    
    return { valid: true };
  };

  const handleSaveEdit = (circuitId: string) => {
    if (!editingCircuitValue.trim()) {
      toast({
        title: "Circuit ID required",
        description: "Please enter a valid circuit ID",
        variant: "destructive",
      });
      return;
    }
    
    // Normalize the circuit ID (convert spaces to proper separators)
    const normalizedId = normalizeCircuitId(editingCircuitValue.trim());
    
    const validation = parseAndCheckCircuitId(normalizedId, circuitId);
    if (!validation.valid) {
      toast({
        title: "Invalid Circuit ID",
        description: validation.error,
        variant: "destructive",
      });
      return;
    }
    
    updateCircuitIdMutation.mutate({ id: circuitId, circuitId: normalizedId });
  };

  const handleAddCircuit = async () => {
    const circuitIdsToAdd = circuitId
      .split(/\r?\n/)
      .map(id => id.trim())
      .filter(Boolean);

    if (circuitIdsToAdd.length === 0) {
      toast({
        title: "Missing circuit ID",
        description: "Please enter a circuit ID (e.g., lg,33-36)",
        variant: "destructive",
      });
      return;
    }

    const normalizedCircuitIds: string[] = [];
    for (const rawCircuitId of circuitIdsToAdd) {
      const normalizedId = normalizeCircuitId(rawCircuitId);
      const validation = parseAndCheckCircuitId(normalizedId);
      if (!validation.valid) {
        toast({
          title: "Invalid Circuit ID",
          description: validation.error,
          variant: "destructive",
        });
        return;
      }
      normalizedCircuitIds.push(normalizedId);
    }

    try {
      for (const normalizedId of normalizedCircuitIds) {
        await createCircuitMutation.mutateAsync({
          cableId: cable.id,
          circuitId: normalizedId,
        });
      }
    } catch {
      // Mutation onError displays the toast; stop adding the remaining rows.
    }
  };

  const handleInsertCircuit = () => {
    if (insertAfterIndex === null) return;

    if (!insertCircuitValue.trim()) {
      toast({
        title: "Missing circuit ID",
        description: "Please enter a circuit ID (e.g., lg,33-36)",
        variant: "destructive",
      });
      return;
    }

    const normalizedId = normalizeCircuitId(insertCircuitValue.trim());
    const validation = parseAndCheckCircuitId(normalizedId);
    if (!validation.valid) {
      toast({
        title: "Invalid Circuit ID",
        description: validation.error,
        variant: "destructive",
      });
      return;
    }

    createCircuitMutation.mutate({
      cableId: cable.id,
      circuitId: normalizedId,
      insertAt: insertAfterIndex + 1,
    });
  };

  const openInsertAt = (insertAt: number) => {
    setInsertAfterIndex(insertAt - 1);
    setInsertCircuitValue("");
  };

  const renderInsertCircuitRow = (insertAt: number, anchorCircuitId: string, position: "before" | "after", columnCount: number) => {
    const isActive = insertAfterIndex === insertAt - 1;

    if (!isActive) {
      const addCountLabel = mode === "fiber" ? "Add Fiber Count" : "Add Pair Count";

      const hasSpliceColumn = cable.type === "Distribution" && !isContextFeed;

      // Zero-height row: the "+" sits on the divider between two counts without adding height.
      return (
        <tr key={`${anchorCircuitId}-insert-${position}`}>
          {/* Spacer so the "+" lines up with the Circuit ID column, not the Splice checkbox. */}
          {hasSpliceColumn && <td className="h-0 p-0" />}
          <td colSpan={hasSpliceColumn ? columnCount - 1 : columnCount} className="relative h-0 p-0">
            {/* Button's hover-elevate forces position: relative, so the wrapper does the positioning. */}
            <div className="absolute left-4 top-0 z-10 -translate-y-1/2">
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 rounded-full border-sky-400 bg-card text-sky-700 shadow-sm [&_svg]:size-3.5 dark:border-sky-700 dark:text-sky-300"
                onClick={() => openInsertAt(insertAt)}
                title={addCountLabel}
                aria-label={addCountLabel}
                data-testid={`button-insert-circuit-${position}-${anchorCircuitId}`}
              >
                <Plus />
              </Button>
            </div>
          </td>
        </tr>
      );
    }

    return (
      <TableRow
        key={`${anchorCircuitId}-insert-${position}`}
        className="border-b border-sky-200 bg-sky-50 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/30 dark:hover:bg-sky-950/45"
      >
        <TableCell colSpan={columnCount} className="h-8 p-1">
          <div className="flex items-center gap-2">
            <Input
              value={insertCircuitValue}
              onChange={(e) => setInsertCircuitValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleInsertCircuit();
                if (e.key === "Escape") {
                  setInsertAfterIndex(null);
                  setInsertCircuitValue("");
                }
              }}
              placeholder="Circuit ID"
              className="h-8 max-w-xs font-mono text-sm"
              data-testid={`input-insert-circuit-${position}-${anchorCircuitId}`}
              autoFocus
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={handleInsertCircuit}
              disabled={createCircuitMutation.isPending}
              data-testid={`button-save-insert-circuit-${position}-${anchorCircuitId}`}
            >
              <Check className="h-4 w-4 text-green-600" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => {
                setInsertAfterIndex(null);
                setInsertCircuitValue("");
              }}
              data-testid={`button-cancel-insert-circuit-${position}-${anchorCircuitId}`}
            >
              <X className="h-4 w-4 text-red-600" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  };

  const totalAssignedFibers = useMemo(() => {
    return circuits.reduce((sum, circuit) => {
      return sum + (circuit.fiberEnd - circuit.fiberStart + 1);
    }, 0);
  }, [circuits]);

  const validationStatus = useMemo(() => {
    return totalAssignedFibers === cable.fiberCount;
  }, [totalAssignedFibers, cable.fiberCount]);

  const fiberDelta = totalAssignedFibers - cable.fiberCount;
  const unitLabel = mode === "fiber" ? "Strands" : "Pairs";
  const failureMessage = fiberDelta > 0
    ? `${fiberDelta} ${unitLabel} Over`
    : `${Math.abs(fiberDelta)} ${unitLabel} Under`;
  const circuitInputRows = circuitInputFocused || circuitId.includes("\n")
    ? Math.max(2, circuitId.split(/\r?\n/).length)
    : 1;

  // Fiber optic color codes (12 colors, repeating pattern)
  const fiberColors = [
    { name: "blue", bg: "bg-blue-500", text: "text-white", colorClass: "text-blue-500" },
    { name: "orange", bg: "bg-orange-500", text: "text-white", colorClass: "text-orange-500" },
    { name: "green", bg: "bg-green-600", text: "text-white", colorClass: "text-green-600" },
    { name: "brown", bg: "bg-amber-700", text: "text-white", colorClass: "text-amber-700" },
    { name: "slate", bg: "bg-slate-500", text: "text-white", colorClass: "text-slate-500" },
    { name: "white", bg: "bg-white", text: "text-black", colorClass: "text-slate-700" },
    { name: "red", bg: "bg-red-600", text: "text-white", colorClass: "text-red-600" },
    { name: "black", bg: "bg-black", text: "text-white", colorClass: "text-slate-900" },
    { name: "yellow", bg: "bg-yellow-400", text: "text-black", colorClass: "text-yellow-500" },
    { name: "violet", bg: "bg-purple-600", text: "text-white", colorClass: "text-purple-600" },
    { name: "pink", bg: "bg-pink-500", text: "text-white", colorClass: "text-pink-500" },
    { name: "aqua", bg: "bg-cyan-400", text: "text-black", colorClass: "text-cyan-500" },
  ];

  // 25-pair copper cable color codes (tip/ring combinations with actual hex colors)
  const pairColors = [
    { name: "W-Bl", tipColor: "#f1f5f9", ringColor: "#3b82f6", textColor: "#ffffff", colorClass: "text-blue-500" },
    { name: "W-Or", tipColor: "#f1f5f9", ringColor: "#f97316", textColor: "#ffffff", colorClass: "text-orange-500" },
    { name: "W-Gr", tipColor: "#f1f5f9", ringColor: "#16a34a", textColor: "#ffffff", colorClass: "text-green-600" },
    { name: "W-Br", tipColor: "#f1f5f9", ringColor: "#b45309", textColor: "#ffffff", colorClass: "text-amber-700" },
    { name: "W-Sl", tipColor: "#f1f5f9", ringColor: "#64748b", textColor: "#ffffff", colorClass: "text-slate-500" },
    { name: "R-Bl", tipColor: "#dc2626", ringColor: "#3b82f6", textColor: "#ffffff", colorClass: "text-blue-500" },
    { name: "R-Or", tipColor: "#dc2626", ringColor: "#f97316", textColor: "#ffffff", colorClass: "text-orange-500" },
    { name: "R-Gr", tipColor: "#dc2626", ringColor: "#16a34a", textColor: "#ffffff", colorClass: "text-green-600" },
    { name: "R-Br", tipColor: "#dc2626", ringColor: "#b45309", textColor: "#ffffff", colorClass: "text-amber-700" },
    { name: "R-Sl", tipColor: "#dc2626", ringColor: "#64748b", textColor: "#ffffff", colorClass: "text-slate-500" },
    { name: "Bk-Bl", tipColor: "#0f172a", ringColor: "#3b82f6", textColor: "#ffffff", colorClass: "text-blue-500" },
    { name: "Bk-Or", tipColor: "#0f172a", ringColor: "#f97316", textColor: "#ffffff", colorClass: "text-orange-500" },
    { name: "Bk-Gr", tipColor: "#0f172a", ringColor: "#16a34a", textColor: "#ffffff", colorClass: "text-green-600" },
    { name: "Bk-Br", tipColor: "#0f172a", ringColor: "#b45309", textColor: "#ffffff", colorClass: "text-amber-700" },
    { name: "Bk-Sl", tipColor: "#0f172a", ringColor: "#64748b", textColor: "#ffffff", colorClass: "text-slate-500" },
    { name: "Y-Bl", tipColor: "#facc15", ringColor: "#3b82f6", textColor: "#ffffff", colorClass: "text-blue-500" },
    { name: "Y-Or", tipColor: "#facc15", ringColor: "#f97316", textColor: "#ffffff", colorClass: "text-orange-500" },
    { name: "Y-Gr", tipColor: "#facc15", ringColor: "#16a34a", textColor: "#ffffff", colorClass: "text-green-600" },
    { name: "Y-Br", tipColor: "#facc15", ringColor: "#b45309", textColor: "#ffffff", colorClass: "text-amber-700" },
    { name: "Y-Sl", tipColor: "#facc15", ringColor: "#64748b", textColor: "#ffffff", colorClass: "text-slate-500" },
    { name: "V-Bl", tipColor: "#9333ea", ringColor: "#3b82f6", textColor: "#ffffff", colorClass: "text-blue-500" },
    { name: "V-Or", tipColor: "#9333ea", ringColor: "#f97316", textColor: "#ffffff", colorClass: "text-orange-500" },
    { name: "V-Gr", tipColor: "#9333ea", ringColor: "#16a34a", textColor: "#ffffff", colorClass: "text-green-600" },
    { name: "V-Br", tipColor: "#9333ea", ringColor: "#b45309", textColor: "#ffffff", colorClass: "text-amber-700" },
    { name: "V-Sl", tipColor: "#9333ea", ringColor: "#64748b", textColor: "#ffffff", colorClass: "text-slate-500" },
  ];

  // Helper to create gradient matching copper splice pattern (tip-ring-tip striping)
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

  const getColorForNumber = (num: number) => {
    if (mode === 'copper') {
      if (num < 1) {
        console.error(`Invalid pair/binder number: ${num}`);
        return pairColors[0]; // Default to first pair
      }
      return pairColors[(num - 1) % 25];
    } else {
      if (num < 1) {
        console.error(`Invalid fiber/ribbon number: ${num}`);
        return fiberColors[0]; // Default to blue
      }
      return fiberColors[(num - 1) % 12];
    }
  };

  const isDeadCircuitId = (circuitId: string) => {
    const prefix = circuitId.split(',')[0]?.trim() ?? "";
    return /^[A-Za-z]$/.test(prefix);
  };

  const getRibbonAndStrandDisplay = (fiberStart: number, fiberEnd: number, ribbonSize: number) => {
    const startRibbon = Math.ceil(fiberStart / ribbonSize);
    const endRibbon = Math.ceil(fiberEnd / ribbonSize);

    const startStrand = ((fiberStart - 1) % ribbonSize) + 1;
    const endStrand = ((fiberEnd - 1) % ribbonSize) + 1;

    const containerLabel = mode === 'copper' ? 'B' : 'R'; // Binder vs Ribbon

    const ColoredRibbon = ({ num }: { num: number }) => {
      const color = getColorForNumber(num);

      // For copper mode, use striped gradient for binder labels with proper text contrast
      if (mode === 'copper') {
        const copperColor = color as typeof pairColors[number];
        const gradient = makeGradient(copperColor);
        return (
          <span
            className="inline-block px-2 py-0.5 rounded border-2 border-black font-mono font-semibold text-xs"
            style={gradient}
          >
            {containerLabel}{num}
          </span>
        );
      }

      // Fiber mode styling — filled badge matching strand layout, with brackets for separation
      const fiberColor = color as { bg: string; text: string };
      return (
        <span className={`inline-block px-2 py-0.5 rounded border border-black ${fiberColor.bg} ${fiberColor.text} font-mono font-semibold text-xs`}>
          {containerLabel}{num}
        </span>
      );
    };

    const ColoredStrand = ({ num }: { num: number }) => {
      const color = getColorForNumber(num);

      // For copper mode, use striped gradient with proper text contrast
      if (mode === 'copper') {
        const copperColor = color as typeof pairColors[number];
        const gradient = makeGradient(copperColor);
        return (
          <span
            className="inline-block px-2 py-0.5 rounded border border-black font-mono font-semibold text-xs"
            style={gradient}
          >
            {num}
          </span>
        );
      } else {
        // Fiber mode - use original solid color with Tailwind classes
        const fiberColor = color as { bg: string; text: string };
        return (
          <span className={`inline-block px-2 py-0.5 rounded border border-black ${fiberColor.bg} ${fiberColor.text} font-mono font-semibold text-xs`}>
            {num}
          </span>
        );
      }
    };
    
    if (startRibbon === endRibbon) {
      // Single ribbon - always show strand range
      return (
        <span className="flex items-center gap-1">
          <ColoredRibbon num={startRibbon} />
          <span className="text-lg font-bold text-muted-foreground leading-none" aria-hidden="true">✱</span>
          <ColoredStrand num={startStrand} />
          <span>-</span>
          <ColoredStrand num={endStrand} />
        </span>
      );
    } else {
      // Multiple ribbons
      const parts = [];
      
      // Check if we start with a partial ribbon
      const startsWithPartialRibbon = startStrand !== 1;
      // Check if we end with a partial ribbon
      const endsWithPartialRibbon = endStrand !== ribbonSize;
      
      // If no partial ribbons, use compact ribbon range format
      if (!startsWithPartialRibbon && !endsWithPartialRibbon) {
        if (startRibbon === endRibbon - 1) {
          // Two consecutive ribbons
          return (
            <span className="flex items-center gap-1">
              <ColoredRibbon num={startRibbon} />
              <span>-</span>
              <ColoredRibbon num={endRibbon} />
            </span>
          );
        } else {
          // More than two ribbons
          return (
            <span className="flex items-center gap-1">
              <ColoredRibbon num={startRibbon} />
              <span>-</span>
              <ColoredRibbon num={endRibbon} />
            </span>
          );
        }
      }
      
      // Has partial ribbons, show each ribbon with strand ranges
      if (startsWithPartialRibbon) {
        // First ribbon is partial
        parts.push(
          <span key={`start-${startRibbon}`} className="flex items-center gap-1">
            <ColoredRibbon num={startRibbon} />
            <span className="text-lg font-bold text-muted-foreground leading-none" aria-hidden="true">✱</span>
            <ColoredStrand num={startStrand} />
            <span>-</span>
            <ColoredStrand num={ribbonSize} />
          </span>
        );
      }
      
      // Determine the range of full ribbons
      const firstFullRibbon = startsWithPartialRibbon ? startRibbon + 1 : startRibbon;
      const lastFullRibbon = endsWithPartialRibbon ? endRibbon - 1 : endRibbon;
      
      // Add full ribbons with explicit strand ranges
      if (firstFullRibbon <= lastFullRibbon) {
        for (let r = firstFullRibbon; r <= lastFullRibbon; r++) {
          parts.push(
            <span key={`full-${r}`} className="flex items-center gap-1">
              <ColoredRibbon num={r} />
              <span className="text-lg font-bold text-muted-foreground leading-none" aria-hidden="true">✱</span>
              <ColoredStrand num={1} />
              <span>-</span>
              <ColoredStrand num={ribbonSize} />
            </span>
          );
        }
      }
      
      if (endsWithPartialRibbon) {
        // Last ribbon is partial
        parts.push(
          <span key={`end-${endRibbon}`} className="flex items-center gap-1">
            <ColoredRibbon num={endRibbon} />
            <span className="text-lg font-bold text-muted-foreground leading-none" aria-hidden="true">✱</span>
            <ColoredStrand num={1} />
            <span>-</span>
            <ColoredStrand num={endStrand} />
          </span>
        );
      }
      
      return (
        <span className="flex flex-col gap-1">
          {parts.map((part, index) => (
            <span key={index}>
              {part}
            </span>
          ))}
        </span>
      );
    }
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading circuits...</div>;
  }

  return (
    <Card data-testid="card-circuit-management">
      <CardHeader className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 space-y-0 pb-4">
        <CardTitle className="text-lg">Circuit Details</CardTitle>
        {!validationStatus ? (
          <div
            className="justify-self-center rounded-md border border-red-300 bg-red-100 px-4 py-1.5 text-base font-bold text-red-700 shadow-sm dark:border-red-800 dark:bg-red-950/50 dark:text-red-300"
            data-testid="text-fiber-delta"
          >
            {failureMessage}
          </div>
        ) : (
          <div />
        )}
        <div className="flex items-center justify-end gap-2">
          <HelpTip text={`Displays Pass when the total assigned ${mode === "fiber" ? "fiber" : "pair"} count matches the cable size, or Fail when there is a discrepancy.`} enabled={helpMode} side="left">
            <span className="inline-flex">
              {validationStatus ? (
                <Badge className="gap-1 bg-green-600 hover:bg-green-700" data-testid="badge-validation-pass">
                  <CheckCircle2 className="h-3 w-3" />
                  Pass
                </Badge>
              ) : (
                <Badge variant="destructive" className="gap-1" data-testid="badge-validation-fail">
                  <XCircle className="h-3 w-3" />
                  Fail
                </Badge>
              )}
            </span>
          </HelpTip>
          <span className="text-sm text-muted-foreground" data-testid="text-cable-size">
            {mode === "fiber" ? "Total Fiber Count" : "Total Pair Count"}: {totalAssignedFibers}/{cable.fiberCount}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Label htmlFor="circuitId" className="text-xs">
              Bulk Add Circuit ID
            </Label>
            <Textarea
              id="circuitId"
              data-testid="input-circuit-id"
              value={circuitId}
              onChange={(e) => setCircuitId(e.target.value)}
              onFocus={() => setCircuitInputFocused(true)}
              onBlur={() => setCircuitInputFocused(false)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleAddCircuit();
                }
              }}
              placeholder="e.g., lg,33-36 or lg 33 36"
              rows={circuitInputRows}
              className="!min-h-9 resize-none overflow-hidden py-2 text-sm"
            />
          </div>
          <HelpTip text="Scan an image to extract circuit IDs using OCR." enabled={helpMode} side="bottom">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setOcrDialogOpen(true)}
              title="Extract text from image (OCR)"
              data-testid="button-open-ocr"
            >
              <Scan className="h-4 w-4" />
            </Button>
          </HelpTip>
          <HelpTip text="Take a picture with your camera for OCR." enabled={helpMode} side="bottom">
            <Button
              variant="outline"
              size="icon"
              onClick={() => cameraInputRef.current?.click()}
              title="Take a picture with your camera for OCR"
              data-testid="button-open-camera-ocr"
            >
              <Camera className="h-4 w-4" />
            </Button>
          </HelpTip>
          {circuitInputFocused && (
            <>
              <HelpTip text="Add the circuit IDs entered in the text field to this cable." enabled={helpMode} side="bottom">
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-green-600 hover:bg-green-50 hover:text-green-700 dark:text-green-400 dark:hover:bg-green-950/40"
                  data-testid="button-add-circuit"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleAddCircuit}
                  disabled={createCircuitMutation.isPending}
                  title="Add circuit IDs"
                >
                  <Check className="h-5 w-5" />
                </Button>
              </HelpTip>
              <HelpTip text="Clear the circuit ID text field." enabled={helpMode} side="bottom">
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40"
                  data-testid="button-clear-circuit-input"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setCircuitId("");
                    setCircuitInputFocused(false);
                  }}
                  title="Clear circuit IDs"
                >
                  <X className="h-5 w-5" />
                </Button>
              </HelpTip>
            </>
          )}
        </div>

        {circuits.length > 0 && (
          <div className="rounded-md border">
            {/* Bottom margin keeps the last "+" (which hangs below the final row) inside the scroll area. */}
            <Table className="mb-4">
              <TableHeader>
                <TableRow>
                  {cable.type === "Distribution" && !isContextFeed && (
                    <TableHead className="w-[10%]">Splice</TableHead>
                  )}
                  <TableHead className={cable.type === "Distribution" && !isContextFeed ? "w-[30%]" : "w-[35%]"}>Circuit ID</TableHead>
                  <TableHead>{mode === "fiber" ? "Ribbons/Strands" : "Binders/Pairs"}</TableHead>
                  <TableHead className="w-[12%]">{mode === "fiber" ? "Fiber Count" : "Pair Count"}</TableHead>
                  <TableHead className="w-[15%] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {circuits.map((circuit, index) => {
                  const ribbonDisplay = getRibbonAndStrandDisplay(
                    circuit.fiberStart,
                    circuit.fiberEnd,
                    cable.ribbonSize
                  );
                  const isEditing = editingCircuitId === circuit.id;
                  const isDeadCircuit = isDeadCircuitId(circuit.circuitId);
                  const columnCount = cable.type === "Distribution" && !isContextFeed ? 5 : 4;

                  return (
                    <Fragment key={`${circuit.id}-with-insert`}>
                    {index === 0 && renderInsertCircuitRow(0, circuit.id, "before", columnCount)}
                    <TableRow
                      key={circuit.id}
                      className={isDeadCircuit ? "bg-red-50/80 hover:bg-red-100/80 dark:bg-red-950/20 dark:hover:bg-red-950/30" : undefined}
                      data-testid={`row-circuit-${circuit.id}`}
                    >
                      {cable.type === "Distribution" && !isContextFeed && (
                        <TableCell>
                          <HelpTip text="Check to splice this circuit to the feed cable. Matches fibers by position." enabled={helpMode} side="right">
                            <span className="inline-flex">
                              <Checkbox
                                checked={circuit.isSpliced === 1}
                                onCheckedChange={(checked) => handleCheckboxChange(circuit, checked as boolean)}
                                data-testid={`checkbox-spliced-${circuit.id}`}
                                disabled={isEditing}
                              />
                            </span>
                          </HelpTip>
                        </TableCell>
                      )}
                      <TableCell className="font-mono text-sm" data-testid={`text-circuit-id-${circuit.id}`}>
                        {isEditing ? (
                          <Input
                            value={editingCircuitValue}
                            onChange={(e) => setEditingCircuitValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveEdit(circuit.id);
                              if (e.key === "Escape") handleCancelEdit();
                            }}
                            className="text-sm font-mono h-8"
                            data-testid={`input-edit-circuit-${circuit.id}`}
                            autoFocus
                          />
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <span>{circuit.circuitId}</span>
                            {isDeadCircuit && (
                              <Badge variant="destructive" className="px-1.5 py-0 text-[10px] leading-4">
                                Dead
                              </Badge>
                            )}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm" data-testid={`text-fiber-range-${circuit.id}`}>
                        {ribbonDisplay}
                      </TableCell>
                      <TableCell className="text-sm" data-testid={`text-fiber-count-${circuit.id}`}>
                        {circuit.fiberEnd - circuit.fiberStart + 1}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {isEditing ? (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleSaveEdit(circuit.id)}
                                disabled={updateCircuitIdMutation.isPending}
                                data-testid={`button-save-circuit-${circuit.id}`}
                              >
                                <Check className="h-4 w-4 text-green-600" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={handleCancelEdit}
                                data-testid={`button-cancel-edit-${circuit.id}`}
                              >
                                <X className="h-4 w-4 text-red-600" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <HelpTip text="Edit this circuit's ID." enabled={helpMode} side="top">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => handleStartEdit(circuit)}
                                  data-testid={`button-edit-circuit-${circuit.id}`}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                              </HelpTip>
                              <HelpTip text="Move this circuit up in the list." enabled={helpMode} side="top">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => moveCircuitMutation.mutate({ id: circuit.id, direction: "up" })}
                                  disabled={index === 0 || moveCircuitMutation.isPending}
                                  data-testid={`button-move-up-${circuit.id}`}
                                >
                                  <ChevronUp className="h-4 w-4" />
                                </Button>
                              </HelpTip>
                              <HelpTip text="Move this circuit down in the list." enabled={helpMode} side="top">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => moveCircuitMutation.mutate({ id: circuit.id, direction: "down" })}
                                  disabled={index === circuits.length - 1 || moveCircuitMutation.isPending}
                                  data-testid={`button-move-down-${circuit.id}`}
                                >
                                  <ChevronDown className="h-4 w-4" />
                                </Button>
                              </HelpTip>
                              <HelpTip text="Delete this circuit from the cable." enabled={helpMode} side="top">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  data-testid={`button-delete-circuit-${circuit.id}`}
                                  onClick={() => deleteCircuitMutation.mutate(circuit.id)}
                                  disabled={deleteCircuitMutation.isPending}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </HelpTip>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {renderInsertCircuitRow(index + 1, circuit.id, "after", columnCount)}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {circuits.length === 0 && (
          <div className="text-center py-6 text-sm text-muted-foreground">
            No circuits defined. Add a circuit to get started.
          </div>
        )}
      </CardContent>

      <OcrDialog
        open={ocrDialogOpen}
        onOpenChange={(isOpen) => {
          setOcrDialogOpen(isOpen);
          if (!isOpen) setCameraImage("");
        }}
        initialImage={cameraImage}
        onTextExtracted={(text) => {
          // Append extracted text to current circuit ID input
          setCircuitId(prev => prev ? `${prev}\n${text}` : text);
          setCameraImage("");
        }}
      />

      {/* Hidden file input for camera capture — opens native camera on mobile */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCameraCapture}
        className="hidden"
      />

      <CropDialog
        open={cropDialogOpen}
        onOpenChange={setCropDialogOpen}
        imageSrc={cameraImage}
        onImageCropped={(croppedImage) => {
          setCameraImage(croppedImage);
          setCropDialogOpen(false);
          setOcrDialogOpen(true);
        }}
        onRetake={() => {
          setCropDialogOpen(false);
          setTimeout(() => cameraInputRef.current?.click(), 100);
        }}
      />
    </Card>
  );
}
