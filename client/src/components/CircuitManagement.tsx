import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Circuit, Cable, InsertCircuit } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, CheckCircle2, XCircle, Edit2, Check, X, ChevronUp, ChevronDown } from "lucide-react";
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

interface CircuitManagementProps {
  cable: Cable;
}

export function CircuitManagement({ cable }: CircuitManagementProps) {
  const { toast } = useToast();
  const [circuitId, setCircuitId] = useState("");
  const [editingCircuitId, setEditingCircuitId] = useState<string | null>(null);
  const [editingCircuitValue, setEditingCircuitValue] = useState("");

  const { data: circuits = [], isLoading } = useQuery<Circuit[]>({
    queryKey: ["/api/circuits/cable", cable.id],
  });

  const { data: allCables = [] } = useQuery<Cable[]>({
    queryKey: ["/api/cables"],
  });

  const { data: allCircuits = [] } = useQuery<Circuit[]>({
    queryKey: ["/api/circuits"],
  });

  const createCircuitMutation = useMutation({
    mutationFn: async (data: InsertCircuit) => {
      return await apiRequest("POST", "/api/circuits", data);
    },
    onSuccess: async () => {
      // Force refetch to update UI
      await queryClient.refetchQueries({ queryKey: ["/api/circuits/cable", cable.id] });
      await queryClient.refetchQueries({ queryKey: ["/api/circuits"] });
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
      return await apiRequest("DELETE", `/api/circuits/${id}`, undefined);
    },
    onSuccess: async () => {
      // Force refetch to update UI
      await queryClient.refetchQueries({ queryKey: ["/api/circuits/cable", cable.id] });
      await queryClient.refetchQueries({ queryKey: ["/api/circuits"] });
      toast({ title: "Circuit deleted successfully" });
    },
    onError: async (error: any) => {
      // If circuit doesn't exist (404), still remove from UI
      if (error?.message?.includes("not found") || error?.message?.includes("404")) {
        await queryClient.refetchQueries({ queryKey: ["/api/circuits/cable", cable.id] });
        await queryClient.refetchQueries({ queryKey: ["/api/circuits"] });
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
      return await apiRequest("PATCH", `/api/circuits/${circuitId}/toggle-spliced`, { 
        feedCableId, 
        feedFiberStart, 
        feedFiberEnd 
      });
    },
    onSuccess: async () => {
      // Force refetch to update UI
      await queryClient.refetchQueries({ queryKey: ["/api/circuits/cable", cable.id] });
      await queryClient.refetchQueries({ queryKey: ["/api/circuits"] });
    },
    onError: async (error: any) => {
      // If circuit doesn't exist (404), refresh the UI
      if (error?.message?.includes("not found") || error?.message?.includes("404")) {
        await queryClient.refetchQueries({ queryKey: ["/api/circuits/cable", cable.id] });
        await queryClient.refetchQueries({ queryKey: ["/api/circuits"] });
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
      return await apiRequest("PATCH", `/api/circuits/${id}/update-circuit-id`, { circuitId });
    },
    onSuccess: async () => {
      // Force refetch to update UI with recalculated fiber positions
      await queryClient.refetchQueries({ queryKey: ["/api/circuits/cable", cable.id] });
      await queryClient.refetchQueries({ queryKey: ["/api/circuits"] });
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
      return await apiRequest("PATCH", `/api/circuits/${id}/move`, { direction });
    },
    onSuccess: async () => {
      // Force refetch to update UI with new positions and recalculated fiber positions
      await queryClient.refetchQueries({ queryKey: ["/api/circuits/cable", cable.id] });
      await queryClient.refetchQueries({ queryKey: ["/api/circuits"] });
      toast({ title: "Circuit moved successfully" });
    },
    onError: () => {
      toast({ title: "Failed to move circuit", variant: "destructive" });
    },
  });

  const handleCheckboxChange = (circuit: Circuit, checked: boolean) => {
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
      
      // Find matching circuit in Feed cables where the Distribution range is within the Feed range
      const matchingFeedCircuit = allCircuits.find(c => {
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
        
        // Check if Distribution range is within Feed range
        const isWithinRange = distStart >= feedStart && distEnd <= feedEnd;
        
        return isWithinRange;
      });

      if (!matchingFeedCircuit) {
        toast({
          title: "No matching Feed circuit found",
          description: `Could not find a Feed circuit with prefix "${distributionPrefix}" that contains the range ${distStart}-${distEnd}`,
          variant: "destructive",
        });
        return;
      }

      // Get the Feed cable for this circuit
      const feedCable = allCables.find(c => c.id === matchingFeedCircuit.cableId);
      
      // Parse Feed circuit range to calculate the specific fiber subset
      const feedParts = matchingFeedCircuit.circuitId.split(',');
      const feedRangeParts = feedParts[1].trim().split('-');
      const feedStart = parseInt(feedRangeParts[0]);
      const feedEnd = parseInt(feedRangeParts[1]);
      
      // Calculate offset: where does the Distribution range start within the Feed range?
      const offsetFromFeedStart = distStart - feedStart;
      const offsetFromFeedEnd = distEnd - feedStart;
      
      // Calculate the actual Feed fiber positions for this subset
      const calculatedFeedFiberStart = matchingFeedCircuit.fiberStart + offsetFromFeedStart;
      const calculatedFeedFiberEnd = matchingFeedCircuit.fiberStart + offsetFromFeedEnd;
      
      toggleSplicedMutation.mutate({
        circuitId: circuit.id,
        feedCableId: feedCable?.id,
        feedFiberStart: calculatedFeedFiberStart,
        feedFiberEnd: calculatedFeedFiberEnd,
      });
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
    
    const validation = parseAndCheckCircuitId(editingCircuitValue.trim(), circuitId);
    if (!validation.valid) {
      toast({
        title: "Invalid Circuit ID",
        description: validation.error,
        variant: "destructive",
      });
      return;
    }
    
    updateCircuitIdMutation.mutate({ id: circuitId, circuitId: editingCircuitValue });
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

    const validation = parseAndCheckCircuitId(circuitId.trim());
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
      circuitId: circuitId.trim(),
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
    { name: "blue", bg: "bg-blue-500", text: "text-white" },
    { name: "orange", bg: "bg-orange-500", text: "text-white" },
    { name: "green", bg: "bg-green-600", text: "text-white" },
    { name: "brown", bg: "bg-amber-700", text: "text-white" },
    { name: "slate", bg: "bg-slate-500", text: "text-white" },
    { name: "white", bg: "bg-white", text: "text-black" },
    { name: "red", bg: "bg-red-600", text: "text-white" },
    { name: "black", bg: "bg-black", text: "text-white" },
    { name: "yellow", bg: "bg-yellow-400", text: "text-black" },
    { name: "violet", bg: "bg-purple-600", text: "text-white" },
    { name: "pink", bg: "bg-pink-500", text: "text-white" },
    { name: "aqua", bg: "bg-cyan-400", text: "text-black" },
  ];

  const getColorForNumber = (num: number) => {
    if (num < 1) {
      console.error(`Invalid fiber/ribbon number: ${num}`);
      return fiberColors[0]; // Default to blue
    }
    return fiberColors[(num - 1) % 12];
  };

  const getRibbonAndStrandDisplay = (fiberStart: number, fiberEnd: number, ribbonSize: number) => {
    const startRibbon = Math.ceil(fiberStart / ribbonSize);
    const endRibbon = Math.ceil(fiberEnd / ribbonSize);
    
    const startStrand = ((fiberStart - 1) % ribbonSize) + 1;
    const endStrand = ((fiberEnd - 1) % ribbonSize) + 1;
    
    const ColoredRibbon = ({ num }: { num: number }) => {
      const color = getColorForNumber(num);
      return (
        <span className={`inline-block px-2 py-0.5 rounded border border-black ${color.bg} ${color.text} font-mono font-semibold text-xs`}>
          R{num}
        </span>
      );
    };
    
    const ColoredStrand = ({ num }: { num: number }) => {
      const color = getColorForNumber(num);
      return (
        <span className={`inline-block px-2 py-0.5 rounded border border-black ${color.bg} ${color.text} font-mono font-semibold text-xs`}>
          {num}
        </span>
      );
    };
    
    if (startRibbon === endRibbon) {
      // Single ribbon
      if (startStrand === 1 && endStrand === ribbonSize) {
        // Full ribbon, just show R1
        return <ColoredRibbon num={startRibbon} />;
      }
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
      
      // Add full ribbons as a range
      if (firstFullRibbon <= lastFullRibbon) {
        if (firstFullRibbon === lastFullRibbon) {
          parts.push(<ColoredRibbon key={`full-${firstFullRibbon}`} num={firstFullRibbon} />);
        } else {
          parts.push(
            <span key={`range-${firstFullRibbon}-${lastFullRibbon}`} className="flex items-center gap-1">
              <ColoredRibbon num={firstFullRibbon} />
              <span>-</span>
              <ColoredRibbon num={lastFullRibbon} />
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
        <span className="flex items-center gap-2 flex-wrap">
          {parts.map((part, index) => (
            <span key={index} className="flex items-center gap-1">
              {part}
              {index < parts.length - 1 && <span className="mx-1">/</span>}
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
            Fiber Count: {totalAssignedFibers}/{cable.fiberCount}
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
              placeholder="e.g., lg,33-36"
              className="text-sm"
            />
          </div>
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
                  <TableHead className={cable.type === "Distribution" ? "w-[25%]" : "w-[30%]"}>Circuit ID</TableHead>
                  <TableHead className={cable.type === "Distribution" ? "w-[35%]" : "w-[35%]"}>Fiber Strands</TableHead>
                  <TableHead className="w-[15%]">Fiber Count</TableHead>
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
    </Card>
  );
}
