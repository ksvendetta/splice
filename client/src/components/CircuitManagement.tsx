import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Circuit, Cable, InsertCircuit } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, CheckCircle2, XCircle } from "lucide-react";
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

  const { data: circuits = [], isLoading } = useQuery<Circuit[]>({
    queryKey: ["/api/circuits/cable", cable.id],
    queryFn: async () => {
      const response = await fetch(`/api/circuits/cable/${cable.id}`);
      if (!response.ok) throw new Error("Failed to fetch circuits");
      return response.json();
    },
  });

  const createCircuitMutation = useMutation({
    mutationFn: async (data: InsertCircuit) => {
      return await apiRequest("POST", "/api/circuits", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/circuits/cable", cable.id] });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/circuits/cable", cable.id] });
      toast({ title: "Circuit deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete circuit", variant: "destructive" });
    },
  });

  const toggleSplicedMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("PATCH", `/api/circuits/${id}/toggle-spliced`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/circuits/cable", cable.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/circuits"] });
    },
    onError: () => {
      toast({ title: "Failed to toggle splice status", variant: "destructive" });
    },
  });

  const handleAddCircuit = () => {
    if (!circuitId.trim()) {
      toast({
        title: "Missing circuit ID",
        description: "Please enter a circuit ID (e.g., lg,33-36)",
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

  const getRibbonAndStrandDisplay = (fiberStart: number, fiberEnd: number, ribbonSize: number) => {
    const startRibbon = Math.ceil(fiberStart / ribbonSize);
    const endRibbon = Math.ceil(fiberEnd / ribbonSize);
    
    const startStrand = ((fiberStart - 1) % ribbonSize) + 1;
    const endStrand = ((fiberEnd - 1) % ribbonSize) + 1;
    
    if (startRibbon === endRibbon) {
      return `R${startRibbon}: ${startStrand}-${endStrand}`;
    } else {
      const firstRibbonEnd = ribbonSize;
      const lastRibbonStart = 1;
      
      let result = `R${startRibbon}: ${startStrand}-${firstRibbonEnd}`;
      
      for (let ribbon = startRibbon + 1; ribbon < endRibbon; ribbon++) {
        result += ` / R${ribbon}: 1-${ribbonSize}`;
      }
      
      result += ` / R${endRibbon}: ${lastRibbonStart}-${endStrand}`;
      
      return result;
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
            <Badge variant="default" className="gap-1" data-testid="badge-validation-pass">
              <CheckCircle2 className="h-3 w-3" />
              Pass
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1" data-testid="badge-validation-fail">
              <XCircle className="h-3 w-3" />
              Fail
            </Badge>
          )}
          <span className="text-sm text-muted-foreground" data-testid="text-fiber-count">
            {totalAssignedFibers} / {cable.fiberCount} fibers
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
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
            <p className="text-xs text-muted-foreground mt-1">
              Fiber positions auto-calculated from circuit order
            </p>
          </div>
          <div className="flex items-end">
            <Button
              size="icon"
              data-testid="button-add-circuit"
              onClick={handleAddCircuit}
              disabled={createCircuitMutation.isPending}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {circuits.length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {cable.type === "Distribution" && (
                    <TableHead className="w-[10%]">Splice</TableHead>
                  )}
                  <TableHead className={cable.type === "Distribution" ? "w-[30%]" : "w-[40%]"}>Circuit ID</TableHead>
                  <TableHead className={cable.type === "Distribution" ? "w-[45%]" : "w-[45%]"}>Fiber Strands</TableHead>
                  <TableHead className="w-[15%] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {circuits.map((circuit) => {
                  const ribbonDisplay = getRibbonAndStrandDisplay(
                    circuit.fiberStart,
                    circuit.fiberEnd,
                    cable.ribbonSize
                  );
                  
                  return (
                    <TableRow key={circuit.id} data-testid={`row-circuit-${circuit.id}`}>
                      {cable.type === "Distribution" && (
                        <TableCell>
                          <Checkbox
                            checked={circuit.isSpliced === 1}
                            onCheckedChange={() => toggleSplicedMutation.mutate(circuit.id)}
                            data-testid={`checkbox-spliced-${circuit.id}`}
                          />
                        </TableCell>
                      )}
                      <TableCell className="font-mono text-sm" data-testid={`text-circuit-id-${circuit.id}`}>
                        {circuit.circuitId}
                      </TableCell>
                      <TableCell className="font-mono text-sm" data-testid={`text-fiber-range-${circuit.id}`}>
                        {ribbonDisplay}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          data-testid={`button-delete-circuit-${circuit.id}`}
                          onClick={() => deleteCircuitMutation.mutate(circuit.id)}
                          disabled={deleteCircuitMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
