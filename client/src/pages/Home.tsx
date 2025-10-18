import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Cable, Circuit, InsertCable } from "@shared/schema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CableCard } from "@/components/CableCard";
import { CableForm } from "@/components/CableForm";
import { CableVisualization } from "@/components/CableVisualization";
import { CircuitManagement } from "@/components/CircuitManagement";
import { Plus, Cable as CableIcon, Network, Workflow } from "lucide-react";
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

export default function Home() {
  const { toast } = useToast();
  const [selectedCableId, setSelectedCableId] = useState<string | null>(null);
  const [cableDialogOpen, setCableDialogOpen] = useState(false);
  const [editingCable, setEditingCable] = useState<Cable | null>(null);

  const { data: cables = [], isLoading: cablesLoading } = useQuery<Cable[]>({
    queryKey: ["/api/cables"],
  });

  const { data: allCircuits = [], isLoading: circuitsLoading } = useQuery<Circuit[]>({
    queryKey: ["/api/circuits"],
  });

  // Sort cables: Feed first, then Distribution (maintaining insertion order within each type)
  const sortedCables = useMemo(() => {
    const feedCables = cables.filter(c => c.type === "Feed");
    const distributionCables = cables.filter(c => c.type === "Distribution");
    return [...feedCables, ...distributionCables];
  }, [cables]);

  const createCableMutation = useMutation({
    mutationFn: async (data: InsertCable) => {
      return await apiRequest("POST", "/api/cables", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/circuits"] });
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
      return await apiRequest("PUT", `/api/cables/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/circuits"] });
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
      return await apiRequest("DELETE", `/api/cables/${id}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/circuits"] });
      toast({ title: "Cable deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete cable", variant: "destructive" });
    },
  });

  const handleCableSubmit = (data: InsertCable) => {
    if (editingCable) {
      updateCableMutation.mutate({ id: editingCable.id, data });
    } else {
      createCableMutation.mutate(data);
    }
  };


  const splicedCircuits = useMemo(() => {
    return allCircuits.filter((circuit) => {
      const cable = cables.find(c => c.id === circuit.cableId);
      return circuit.isSpliced === 1 && cable?.type === "Distribution";
    });
  }, [allCircuits, cables]);

  const selectedCable = cables.find((c) => c.id === selectedCableId);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <Network className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-semibold">Fiber Splice Manager</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-6">
        <Tabs defaultValue="input" className="w-full">
          <TabsList className="mb-6" data-testid="tabs-main">
            <TabsTrigger value="input" data-testid="tab-input-data">
              <CableIcon className="h-4 w-4 mr-2" />
              InputData
            </TabsTrigger>
            <TabsTrigger value="splice" data-testid="tab-splice">
              <Workflow className="h-4 w-4 mr-2" />
              Splice
            </TabsTrigger>
          </TabsList>

          <TabsContent value="input" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Cables</h2>
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditingCable(null);
                      setCableDialogOpen(true);
                    }}
                    data-testid="button-add-cable"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Cable
                  </Button>
                </div>

                <ScrollArea className="h-[600px] pr-4">
                  <div className="space-y-2">
                    {cablesLoading ? (
                      <div className="text-center py-12 text-muted-foreground">Loading cables...</div>
                    ) : sortedCables.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground" data-testid="text-no-cables">
                        No cables yet. Add a cable to get started.
                      </div>
                    ) : (
                      sortedCables.map((cable) => {
                        const cableCircuits = allCircuits.filter(c => c.cableId === cable.id);
                        const totalAssignedFibers = cableCircuits.reduce((sum, circuit) => {
                          return sum + (circuit.fiberEnd - circuit.fiberStart + 1);
                        }, 0);
                        const isValid = totalAssignedFibers === cable.fiberCount;
                        
                        return (
                          <CableCard
                            key={cable.id}
                            cable={cable}
                            isSelected={selectedCableId === cable.id}
                            onSelect={() => setSelectedCableId(cable.id)}
                            onEdit={() => {
                              setEditingCable(cable);
                              setCableDialogOpen(true);
                            }}
                            onDelete={() => deleteCableMutation.mutate(cable.id)}
                            isValid={isValid}
                          />
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </div>

              <div className="lg:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {selectedCable ? `Cable: ${selectedCable.name}` : "Select a cable"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedCable ? (
                      <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Type:</span>
                            <span className="ml-2 font-medium">{selectedCable.type}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Cable Size:</span>
                            <span className="ml-2 font-mono font-medium">{selectedCable.fiberCount}</span>
                          </div>
                        </div>

                        <CircuitManagement cable={selectedCable} />
                      </div>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        Select a cable from the list to view details
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="splice">
            <Card>
              <CardHeader>
                <CardTitle>Splice Mapping</CardTitle>
              </CardHeader>
              <CardContent>
                {circuitsLoading ? (
                  <div className="text-center py-12 text-muted-foreground">Loading circuits...</div>
                ) : splicedCircuits.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground" data-testid="text-no-spliced-circuits">
                    No circuits marked as spliced yet. Check Distribution circuits in the InputData tab.
                  </div>
                ) : (
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead colSpan={3} className="text-center font-semibold bg-green-100 dark:bg-green-950/50">Feed</TableHead>
                          <TableHead className="text-center font-semibold">Count</TableHead>
                          <TableHead colSpan={3} className="text-center font-semibold bg-blue-100 dark:bg-blue-950/50">Distribution</TableHead>
                        </TableRow>
                        <TableRow>
                          <TableHead className="text-center">Cable</TableHead>
                          <TableHead className="text-center">Ribbon</TableHead>
                          <TableHead className="text-center">Strand</TableHead>
                          <TableHead className="text-center"></TableHead>
                          <TableHead className="text-center">Strand</TableHead>
                          <TableHead className="text-center">Ribbon</TableHead>
                          <TableHead className="text-center">Cable</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {splicedCircuits.flatMap((circuit, circuitIndex) => {
                          const distributionCable = cables.find((c) => c.id === circuit.cableId);
                          const feedCable = circuit.feedCableId ? cables.find((c) => c.id === circuit.feedCableId) : undefined;
                          
                          // Alternate background color based on circuit index
                          const rowBgColor = circuitIndex % 2 === 0 
                            ? "bg-white dark:bg-background" 
                            : "bg-gray-200 dark:bg-muted/50";
                          
                          if (!feedCable) {
                            return [(
                              <TableRow key={circuit.id} className={rowBgColor} data-testid={`row-spliced-circuit-${circuit.id}`}>
                                <TableCell colSpan={7} className="text-center text-muted-foreground">
                                  Circuit {circuit.circuitId} in {distributionCable?.name} - No feed cable selected. Please re-check the circuit.
                                </TableCell>
                              </TableRow>
                            )];
                          }
                          
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
                          
                          const ribbonSize = 12;
                          const getRibbonNumber = (fiber: number) => Math.ceil(fiber / ribbonSize);
                          const getFiberPositionInRibbon = (fiber: number) => ((fiber - 1) % ribbonSize) + 1;
                          const getColorForStrand = (strand: number) => fiberColors[(strand - 1) % 12];
                          
                          // Parse circuit ID to get the circuit numbers
                          const circuitIdParts = circuit.circuitId.split(',');
                          const circuitPrefix = circuitIdParts[0] || "";
                          const circuitRange = circuitIdParts[1] || "";
                          const [rangeStart, rangeEnd] = circuitRange.split('-').map(n => parseInt(n.trim()));
                          
                          // Generate one row per fiber
                          const fiberRows = [];
                          for (let i = 0; i < circuit.fiberEnd - circuit.fiberStart + 1; i++) {
                            const distFiber = circuit.fiberStart + i;
                            const feedFiber = (circuit.feedFiberStart || circuit.fiberStart) + i;
                            
                            const distRibbon = getRibbonNumber(distFiber);
                            const distStrand = getFiberPositionInRibbon(distFiber);
                            const feedRibbon = getRibbonNumber(feedFiber);
                            const feedStrand = getFiberPositionInRibbon(feedFiber);
                            
                            const circuitNumber = rangeStart + i;
                            const feedColor = getColorForStrand(feedStrand);
                            const distColor = getColorForStrand(distStrand);
                            const ribbonColor = getColorForStrand(feedRibbon);
                            
                            fiberRows.push(
                              <TableRow key={`${circuit.id}-fiber-${i}`} className={rowBgColor} data-testid={`row-fiber-${circuit.id}-${i}`}>
                                <TableCell className="text-center font-mono text-sm">{feedCable.fiberCount}</TableCell>
                                <TableCell className="text-center font-mono font-semibold">{feedRibbon}</TableCell>
                                <TableCell className="text-center">
                                  <div className={`inline-block px-3 py-1 rounded border-2 border-black ${feedColor.bg} ${feedColor.text} font-mono font-semibold`}>
                                    {feedStrand}
                                  </div>
                                </TableCell>
                                <TableCell className="text-center font-mono font-semibold">{circuitPrefix},{circuitNumber}</TableCell>
                                <TableCell className="text-center">
                                  <div className={`inline-block px-3 py-1 rounded border-2 border-black ${distColor.bg} ${distColor.text} font-mono font-semibold`}>
                                    {distStrand}
                                  </div>
                                </TableCell>
                                <TableCell className="text-center font-mono font-semibold">{distRibbon}</TableCell>
                                <TableCell className="text-center font-mono text-sm">{distributionCable?.fiberCount}</TableCell>
                              </TableRow>
                            );
                          }
                          
                          return fiberRows;
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={cableDialogOpen} onOpenChange={setCableDialogOpen}>
        <DialogContent data-testid="dialog-cable-form">
          <DialogHeader>
            <DialogTitle>{editingCable ? "Edit Cable" : "Add New Cable"}</DialogTitle>
          </DialogHeader>
          <CableForm
            cable={editingCable || undefined}
            onSubmit={handleCableSubmit}
            onCancel={() => {
              setCableDialogOpen(false);
              setEditingCable(null);
            }}
            isLoading={createCableMutation.isPending || updateCableMutation.isPending}
          />
        </DialogContent>
      </Dialog>

    </div>
  );
}
