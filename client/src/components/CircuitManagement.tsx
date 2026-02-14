import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Circuit, Cable, InsertCircuit } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, CheckCircle2, XCircle, Edit2, Check, X, ChevronUp, ChevronDown, Scan } from "lucide-react";
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
import { normalizeCircuitId } from "@/lib/circuitIdUtils";

interface CircuitManagementProps {
  cable: Cable;
  mode?: "fiber" | "copper";
}

export function CircuitManagement({ cable, mode = "fiber" }: CircuitManagementProps) {
  const { toast } = useToast();
  const [circuitId, setCircuitId] = useState("");
  const [editingCircuitId, setEditingCircuitId] = useState<string | null>(null);
  const [editingCircuitValue, setEditingCircuitValue] = useState("");
  const [ocrDialogOpen, setOcrDialogOpen] = useState(false);

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
    mutationFn: async (data: InsertCircuit) => {
      return await apiRequest("POST", `/api/${mode}/circuits`, data);
    },
    onSuccess: async () => {
      // Force refetch to update UI
      await queryClient.refetchQueries({ queryKey: [`/api/${mode}/circuits/cable`, cable.id] });
      await queryClient.refetchQueries({ queryKey: [`/api/${mode}/circuits`] });
      setCircuitId("");
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

  const toggleSplicedMutation = useMutation({
    mutationFn: async ({ circuitId, feedCableId, feedFiberStart, feedFiberEnd }: {
      circuitId: string;
      feedCableId?: string;
      feedFiberStart?: number;
      feedFiberEnd?: number;
    }) => {
      return await apiRequest("PATCH", `/api/${mode}/circuits/${circuitId}/toggle-spliced`, {
        feedCableId,
        feedFiberStart,
        feedFiberEnd
      });
    },
    onSuccess: async () => {
      // Force refetch to update UI
      await queryClient.refetchQueries({ queryKey: [`/api/${mode}/circuits/cable`, cable.id] });
      await queryClient.refetchQueries({ queryKey: [`/api/${mode}/circuits`] });
    },
    onError: async (error: any) => {
      // If circuit doesn't exist (404), refresh the UI
      if (error?.message?.includes("not found") || error?.message?.includes("404")) {
        await queryClient.refetchQueries({ queryKey: [`/api/${mode}/circuits/cable`, cable.id] });
        await queryClient.refetchQueries({ queryKey: [`/api/${mode}/circuits`] });
        toast({ title: "Circuit not found - display refreshed", variant: "destructive" });
      } else {
        toast({
          title: "Failed to toggle splice status",
          description: error.message || "An error occurred",
          variant: "destructive"
        });
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

  const handleCheckboxChange = async (circuit: Circuit, checked: boolean) => {
    if (cable.type === "Distribution" && checked) {
      // Parse Distribution circuit ID to extract prefix and range
      const distParts = circuit.circuitId.split(',');
      if (distParts.length !== 2) {
        toast({
          title: "Invalid circuit ID format",
          variant: "destructive",
        });
        return;
      }

      const distributionPrefix = distParts[0].trim();
      const distRangeParts = distParts[1].trim().split('-');
      if (distRangeParts.length !== 2) {
        toast({
          title: "Invalid circuit ID range format",
          variant: "destructive",
        });
        return;
      }

      const distStart = parseInt(distRangeParts[0]);
      const distEnd = parseInt(distRangeParts[1]);

      console.log(`[SPLICE] Checking circuit: ${circuit.circuitId}, distStart: ${distStart}, distEnd: ${distEnd}`);

      // Find ALL matching feed circuits that this distribution range overlaps with
      const matchingFeedCircuits = allCircuits.filter(c => {
        const feedCable = allCables.find(cable => cable.id === c.cableId);
        if (feedCable?.type !== "Feed") return false;

        // Parse Feed circuit ID
        const feedParts = c.circuitId.split(',');
        if (feedParts.length !== 2) return false;

        const feedPrefix = feedParts[0].trim();

        // Check if prefixes match
        if (feedPrefix !== distributionPrefix) return false;

        // Parse Feed range
        const feedRangeParts = feedParts[1].trim().split('-');
        if (feedRangeParts.length !== 2) return false;

        const feedStart = parseInt(feedRangeParts[0]);
        const feedEnd = parseInt(feedRangeParts[1]);

        // Check if distribution range overlaps with this feed range
        const overlaps = distStart <= feedEnd && distEnd >= feedStart;

        console.log(`[SPLICE] Checking feed circuit: ${c.circuitId}, feedStart: ${feedStart}, feedEnd: ${feedEnd}, overlaps: ${overlaps}`);

        return overlaps;
      }).sort((a, b) => {
        // Sort by feed range start to process in order
        const aStart = parseInt(a.circuitId.split(',')[1].trim().split('-')[0]);
        const bStart = parseInt(b.circuitId.split(',')[1].trim().split('-')[0]);
        return aStart - bStart;
      });

      if (matchingFeedCircuits.length === 0) {
        toast({
          title: "No matching Feed circuit found",
          description: `Could not find a Feed circuit with prefix "${distributionPrefix}" that contains the range ${distStart}-${distEnd}`,
          variant: "destructive",
        });
        return;
      }

      console.log(`[SPLICE] Found ${matchingFeedCircuits.length} matching feed circuit(s)`);

      // If circuit spans multiple feeds, we need to split it
      if (matchingFeedCircuits.length > 1) {
        console.log(`[SPLICE] Circuit spans multiple feeds - splitting...`);

        // Calculate split points
        const splits: Array<{
          start: number;
          end: number;
          feedCircuit: Circuit;
          feedCable: Cable | undefined;
        }> = [];

        for (let i = 0; i < matchingFeedCircuits.length; i++) {
          const feedCircuit = matchingFeedCircuits[i];
          const feedCable = allCables.find(c => c.id === feedCircuit.cableId);
          const feedParts = feedCircuit.circuitId.split(',');
          const feedRangeParts = feedParts[1].trim().split('-');
          const feedStart = parseInt(feedRangeParts[0]);
          const feedEnd = parseInt(feedRangeParts[1]);

          // Calculate the portion of distribution that overlaps with this feed
          const splitStart = Math.max(distStart, feedStart);
          const splitEnd = Math.min(distEnd, feedEnd);

          splits.push({
            start: splitStart,
            end: splitEnd,
            feedCircuit,
            feedCable
          });
        }

        // Update the original circuit to become the first split, then create additional splits
        try {
          // First split: update the existing circuit
          const firstSplit = splits[0];
          const firstCircuitId = `${distributionPrefix},${firstSplit.start}-${firstSplit.end}`;

          console.log(`[SPLICE] Updating original circuit to: ${firstCircuitId}`);

          // Update the circuit ID
          await apiRequest("PATCH", `/api/${mode}/circuits/${circuit.id}/update-circuit-id`, {
            circuitId: firstCircuitId
          });

          // Calculate feed fiber positions for first split
          const firstFeedStart = parseInt(firstSplit.feedCircuit.circuitId.split(',')[1].trim().split('-')[0]);
          const firstOffsetFromFeedStart = firstSplit.start - firstFeedStart;
          const firstOffsetFromFeedEnd = firstSplit.end - firstFeedStart;
          const firstCalculatedFeedFiberStart = firstSplit.feedCircuit.fiberStart + firstOffsetFromFeedStart;
          const firstCalculatedFeedFiberEnd = firstSplit.feedCircuit.fiberStart + firstOffsetFromFeedEnd;

          console.log(`[SPLICE] Splicing ${firstCircuitId} to ${firstSplit.feedCable?.name}: fibers ${firstCalculatedFeedFiberStart}-${firstCalculatedFeedFiberEnd}`);

          // Mark first split as spliced
          await apiRequest("PATCH", `/api/${mode}/circuits/${circuit.id}/toggle-spliced`, {
            feedCableId: firstSplit.feedCable?.id,
            feedFiberStart: firstCalculatedFeedFiberStart,
            feedFiberEnd: firstCalculatedFeedFiberEnd
          });

          // Get current circuits to determine positioning
          const originalPosition = circuits.findIndex((c: Circuit) => c.id === circuit.id);

          // Create additional split circuits for remaining splits
          for (let i = 1; i < splits.length; i++) {
            const split = splits[i];
            const newCircuitId = `${distributionPrefix},${split.start}-${split.end}`;

            console.log(`[SPLICE] Creating split circuit: ${newCircuitId}`);

            // Create the new circuit - the POST returns the newly created circuit
            const response = await apiRequest("POST", `/api/${mode}/circuits`, {
              cableId: circuit.cableId,
              circuitId: newCircuitId
            });
            const newCircuit = await response.json();

            console.log(`[SPLICE] newCircuit:`, newCircuit);

            if (newCircuit && newCircuit.id) {
              console.log(`[SPLICE] Successfully created circuit with ID: ${newCircuit.id}`);

              // Calculate feed fiber positions
              const feedStart = parseInt(split.feedCircuit.circuitId.split(',')[1].trim().split('-')[0]);
              const offsetFromFeedStart = split.start - feedStart;
              const offsetFromFeedEnd = split.end - feedStart;
              const calculatedFeedFiberStart = split.feedCircuit.fiberStart + offsetFromFeedStart;
              const calculatedFeedFiberEnd = split.feedCircuit.fiberStart + offsetFromFeedEnd;

              console.log(`[SPLICE] Splicing ${newCircuitId} to ${split.feedCable?.name}: fibers ${calculatedFeedFiberStart}-${calculatedFeedFiberEnd}`);

              try {
                // Mark as spliced - use toggle-spliced which will set isSpliced to 1
                await apiRequest("PATCH", `/api/${mode}/circuits/${newCircuit.id}/toggle-spliced`, {
                  feedCableId: split.feedCable?.id,
                  feedFiberStart: calculatedFeedFiberStart,
                  feedFiberEnd: calculatedFeedFiberEnd
                });
                console.log(`[SPLICE] Successfully spliced ${newCircuitId}`);
              } catch (error) {
                console.error(`[SPLICE] Error splicing ${newCircuitId}:`, error);
                throw error;
              }

              // Move the new circuit to be right after the previous split
              // The new circuit is created at the end, so we need to move it up
              try {
                // Refetch circuits to get updated positions
                await queryClient.refetchQueries({ queryKey: [`/api/${mode}/circuits/cable`, cable.id] });
                const updatedCircuits = queryClient.getQueryData<Circuit[]>([`/api/${mode}/circuits/cable`, cable.id]) || [];
                const newCircuitPosition = updatedCircuits.findIndex((c: Circuit) => c.id === newCircuit.id);
                const targetPosition = originalPosition + i; // Position after the original

                console.log(`[SPLICE] Moving circuit from position ${newCircuitPosition} to ${targetPosition}`);

                // Move up until it reaches the target position
                const movesNeeded = newCircuitPosition - targetPosition;
                for (let j = 0; j < movesNeeded; j++) {
                  await apiRequest("PATCH", `/api/${mode}/circuits/${newCircuit.id}/move`, {
                    direction: "up"
                  });
                }
                console.log(`[SPLICE] Successfully moved ${newCircuitId}`);
              } catch (error) {
                console.error(`[SPLICE] Error moving ${newCircuitId}:`, error);
                // Don't throw - movement is not critical
              }
            }
          }

          // Refresh the UI
          await queryClient.refetchQueries({ queryKey: [`/api/${mode}/circuits/cable`, cable.id] });
          await queryClient.refetchQueries({ queryKey: [`/api/${mode}/circuits`] });

          toast({
            title: "Circuit split and spliced",
            description: `Created ${splits.length} circuit(s) spanning ${matchingFeedCircuits.length} feed cable(s)`,
          });
        } catch (error) {
          console.error('[SPLICE] Error splitting circuit:', error);
          toast({
            title: "Failed to split circuit",
            variant: "destructive",
          });
        }
      } else {
        // Single feed cable - process normally
        const matchingFeedCircuit = matchingFeedCircuits[0];
        const feedCable = allCables.find(c => c.id === matchingFeedCircuit.cableId);

        console.log(`[SPLICE] Matched feed circuit: ${matchingFeedCircuit.circuitId} on cable: ${feedCable?.name}`);

        // Parse Feed circuit range to calculate the specific fiber subset
        const feedParts = matchingFeedCircuit.circuitId.split(',');
        const feedRangeParts = feedParts[1].trim().split('-');
        const feedStart = parseInt(feedRangeParts[0]);
        const feedEnd = parseInt(feedRangeParts[1]);

        // Calculate offset
        const offsetFromFeedStart = distStart - feedStart;
        const offsetFromFeedEnd = distEnd - feedStart;

        console.log(`[SPLICE] feedStart: ${feedStart}, feedEnd: ${feedEnd}`);
        console.log(`[SPLICE] offsetFromFeedStart: ${offsetFromFeedStart}, offsetFromFeedEnd: ${offsetFromFeedEnd}`);

        // Calculate the actual Feed fiber positions for this subset
        const calculatedFeedFiberStart = matchingFeedCircuit.fiberStart + offsetFromFeedStart;
        const calculatedFeedFiberEnd = matchingFeedCircuit.fiberStart + offsetFromFeedEnd;

        console.log(`[SPLICE] calculatedFeedFiberStart: ${calculatedFeedFiberStart}, calculatedFeedFiberEnd: ${calculatedFeedFiberEnd}`);

        toggleSplicedMutation.mutate({
          circuitId: circuit.id,
          feedCableId: feedCable?.id,
          feedFiberStart: calculatedFeedFiberStart,
          feedFiberEnd: calculatedFeedFiberEnd,
        });
      }
    } else {
      // Unchecking - just toggle without feed cable info
      toggleSplicedMutation.mutate({ circuitId: circuit.id });
    }
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
      
      // Check if same prefix
      if (newPrefix === existingPrefix) {
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

  const handleAddCircuit = () => {
    if (!circuitId.trim()) {
      toast({
        title: "Missing circuit ID",
        description: "Please enter a circuit ID (e.g., lg,33-36)",
        variant: "destructive",
      });
      return;
    }

    // Normalize the circuit ID (convert spaces to proper separators)
    const normalizedId = normalizeCircuitId(circuitId.trim());
    
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
    });
  };

  const totalAssignedFibers = useMemo(() => {
    return circuits.reduce((sum, circuit) => {
      return sum + (circuit.fiberEnd - circuit.fiberStart + 1);
    }, 0);
  }, [circuits]);

  const validationStatus = useMemo(() => {
    return totalAssignedFibers === cable.fiberCount;
  }, [totalAssignedFibers, cable.fiberCount]);

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

      // Fiber mode styling
      const needsInvertedStyle = (num - 1) % 12 === 5; // Index 5 = white for fiber

      if (needsInvertedStyle) {
        return (
          <span className="inline-block px-2 py-0.5 rounded border-2 border-black bg-slate-300 text-white font-mono font-semibold text-xs">
            {containerLabel}{num}
          </span>
        );
      }

      return (
        <span className={`inline-block px-2 py-0.5 rounded border-2 ${color.colorClass} font-mono font-semibold text-xs`} style={{ borderColor: 'currentColor' }}>
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
          <span>:</span>
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
            <span>:</span>
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
              <span>:</span>
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
            <span>:</span>
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
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-4">
        <CardTitle className="text-lg">Circuit Details</CardTitle>
        <div className="flex items-center gap-2">
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
          <span className="text-sm text-muted-foreground" data-testid="text-cable-size">
            {mode === "fiber" ? "Total Fiber Count" : "Total Pair Count"}: {totalAssignedFibers}/{cable.fiberCount}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Label htmlFor="circuitId" className="text-xs">
              Circuit ID
            </Label>
            <Input
              id="circuitId"
              data-testid="input-circuit-id"
              value={circuitId}
              onChange={(e) => setCircuitId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddCircuit()}
              placeholder="e.g., lg,33-36 or lg 33 36"
              className="text-sm"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setOcrDialogOpen(true)}
            title="Extract text from image (OCR)"
            data-testid="button-open-ocr"
          >
            <Scan className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            data-testid="button-add-circuit"
            onClick={handleAddCircuit}
            disabled={createCircuitMutation.isPending}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {circuits.length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {cable.type === "Distribution" && (
                    <TableHead className="w-[10%]">Splice</TableHead>
                  )}
                  <TableHead className={cable.type === "Distribution" ? "w-[30%]" : "w-[35%]"}>Circuit ID</TableHead>
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
                  
                  return (
                    <TableRow key={circuit.id} data-testid={`row-circuit-${circuit.id}`}>
                      {cable.type === "Distribution" && (
                        <TableCell>
                          <Checkbox
                            checked={circuit.isSpliced === 1}
                            onCheckedChange={(checked) => handleCheckboxChange(circuit, checked as boolean)}
                            data-testid={`checkbox-spliced-${circuit.id}`}
                            disabled={isEditing}
                          />
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
                          circuit.circuitId
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
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleStartEdit(circuit)}
                                data-testid={`button-edit-circuit-${circuit.id}`}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => moveCircuitMutation.mutate({ id: circuit.id, direction: "up" })}
                                disabled={index === 0 || moveCircuitMutation.isPending}
                                data-testid={`button-move-up-${circuit.id}`}
                              >
                                <ChevronUp className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => moveCircuitMutation.mutate({ id: circuit.id, direction: "down" })}
                                disabled={index === circuits.length - 1 || moveCircuitMutation.isPending}
                                data-testid={`button-move-down-${circuit.id}`}
                              >
                                <ChevronDown className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                data-testid={`button-delete-circuit-${circuit.id}`}
                                onClick={() => deleteCircuitMutation.mutate(circuit.id)}
                                disabled={deleteCircuitMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
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
        onOpenChange={setOcrDialogOpen}
        onTextExtracted={(text) => {
          // Append extracted text to current circuit ID input
          setCircuitId(prev => prev ? `${prev}\n${text}` : text);
        }}
      />
    </Card>
  );
}
