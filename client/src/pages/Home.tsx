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
import { Plus, Cable as CableIcon, Workflow, FilePlus, History, RotateCcw } from "lucide-react";
import spliceLogo from "@assets/image_1760814059676.png";
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
import { HistoryDialog } from "@/components/HistoryDialog";

export default function Home() {
  const { toast } = useToast();
  const [selectedCableId, setSelectedCableId] = useState<string | null>(null);
  const [cableDialogOpen, setCableDialogOpen] = useState(false);
  const [editingCable, setEditingCable] = useState<Cable | null>(null);
  const [startNewDialogOpen, setStartNewDialogOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);

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

  const saveMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/saves", {});
    },
    onSuccess: () => {
      toast({ title: "Project saved successfully" });
    },
    onError: () => {
      toast({ title: "Failed to save project", variant: "destructive" });
    },
  });

  const startNewMutation = useMutation({
    mutationFn: async () => {
      // First save the current state
      await apiRequest("POST", "/api/saves", {});
      // Then reset all data
      return await apiRequest("DELETE", "/api/reset", undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/circuits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/saves"] });
      setSelectedCableId(null);
      setStartNewDialogOpen(false);
      toast({ title: "Current project saved. Starting new project." });
    },
    onError: () => {
      toast({ title: "Failed to start new project", variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", "/api/reset", undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/circuits"] });
      setSelectedCableId(null);
      setResetDialogOpen(false);
      toast({ title: "All data has been reset" });
    },
    onError: () => {
      toast({ title: "Failed to reset data", variant: "destructive" });
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

  // Get all Distribution cables for creating splice tabs
  const distributionCables = useMemo(() => {
    return cables.filter(c => c.type === "Distribution");
  }, [cables]);

  const selectedCable = cables.find((c) => c.id === selectedCableId);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-6 w-6 overflow-hidden flex items-center justify-center">
                <img 
                  src={spliceLogo} 
                  alt="Splice" 
                  className="h-12 w-12 invert dark:invert-0" 
                  style={{ objectFit: 'cover', objectPosition: 'center' }}
                />
              </div>
              <h1 className="text-xl font-semibold">Fiber Splice Manager</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setHistoryDialogOpen(true)}
                data-testid="button-history"
              >
                <History className="h-4 w-4 mr-2" />
                History
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setResetDialogOpen(true)}
                data-testid="button-reset"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => setStartNewDialogOpen(true)}
                data-testid="button-start-new"
              >
                <FilePlus className="h-4 w-4 mr-2" />
                Start New
              </Button>
            </div>
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
            {distributionCables.map((distCable) => (
              <TabsTrigger 
                key={distCable.id} 
                value={`splice-${distCable.id}`} 
                data-testid={`tab-splice-${distCable.id}`}
              >
                <Workflow className="h-4 w-4 mr-2" />
                Splice {distCable.name}
              </TabsTrigger>
            ))}
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

          {distributionCables.map((distCable) => {
            const cableSplicedCircuits = splicedCircuits.filter(c => c.cableId === distCable.id);
            
            // Check if all circuits use full ribbons (each circuit's fiber count is a multiple of 12)
            const allFullRibbons = cableSplicedCircuits.length > 0 && cableSplicedCircuits.every(circuit => {
              const fiberCount = circuit.fiberEnd - circuit.fiberStart + 1;
              return fiberCount % 12 === 0;
            });
            
            // Calculate total number of splice rows
            const totalSpliceRows = allFullRibbons 
              ? cableSplicedCircuits.reduce((sum, circuit) => {
                  const fiberCount = circuit.fiberEnd - circuit.fiberStart + 1;
                  return sum + (fiberCount / 12);
                }, 0)
              : cableSplicedCircuits.reduce((sum, circuit) => {
                  return sum + (circuit.fiberEnd - circuit.fiberStart + 1);
                }, 0);
            
            return (
              <TabsContent key={distCable.id} value={`splice-${distCable.id}`}>
                <Card>
                  <CardHeader>
                    <CardTitle>Splice Mapping - {distCable.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {circuitsLoading ? (
                      <div className="text-center py-12 text-muted-foreground">Loading circuits...</div>
                    ) : cableSplicedCircuits.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground" data-testid={`text-no-spliced-circuits-${distCable.id}`}>
                        No circuits marked as spliced yet for {distCable.name}. Check circuits in the InputData tab.
                      </div>
                    ) : (
                      <div className="rounded-md border overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead colSpan={allFullRibbons ? 2 : 3} className="text-center font-semibold bg-green-100 dark:bg-green-950/50">Feed</TableHead>
                              <TableHead className="text-center font-semibold">Splices : {totalSpliceRows}</TableHead>
                              <TableHead colSpan={allFullRibbons ? 2 : 3} className="text-center font-semibold bg-blue-100 dark:bg-blue-950/50">Distribution</TableHead>
                            </TableRow>
                            <TableRow>
                              <TableHead className="text-center">Cable</TableHead>
                              <TableHead className="text-center">Ribbon</TableHead>
                              {!allFullRibbons && <TableHead className="text-center">Strand</TableHead>}
                              <TableHead className="text-center"></TableHead>
                              {!allFullRibbons && <TableHead className="text-center">Strand</TableHead>}
                              <TableHead className="text-center">Ribbon</TableHead>
                              <TableHead className="text-center">Cable</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {cableSplicedCircuits.flatMap((circuit, circuitIndex) => {
                              const distributionCable = cables.find((c) => c.id === circuit.cableId);
                              const feedCable = circuit.feedCableId ? cables.find((c) => c.id === circuit.feedCableId) : undefined;
                              
                              // Alternate background color based on circuit index
                              const rowBgColor = circuitIndex % 2 === 0 
                                ? "bg-white dark:bg-background" 
                                : "bg-gray-200 dark:bg-muted/50";
                              
                              if (!feedCable) {
                                return [(
                                  <TableRow key={circuit.id} className={rowBgColor} data-testid={`row-spliced-circuit-${circuit.id}`}>
                                    <TableCell colSpan={allFullRibbons ? 5 : 7} className="text-center text-muted-foreground">
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
                              const getColorForRibbon = (ribbon: number) => fiberColors[(ribbon - 1) % 12];
                              
                              // Parse circuit ID to get the circuit numbers
                              const circuitIdParts = circuit.circuitId.split(',');
                              const circuitPrefix = circuitIdParts[0] || "";
                              const circuitRange = circuitIdParts[1] || "";
                              const [rangeStart, rangeEnd] = circuitRange.split('-').map(n => parseInt(n.trim()));
                              
                              if (allFullRibbons) {
                                // Full ribbon view: show based on actual fiber positions
                                // Need to handle circuits that may span multiple ribbons
                                const ribbonRows = [];
                                
                                // Group fibers by ribbon for both feed and distribution
                                const distFiberStart = circuit.fiberStart;
                                const distFiberEnd = circuit.fiberEnd;
                                const feedFiberStart = circuit.feedFiberStart || circuit.fiberStart;
                                const feedFiberEnd = circuit.feedFiberEnd || circuit.fiberEnd;
                                
                                // Find which ribbons this circuit spans on distribution side
                                const distStartRibbon = getRibbonNumber(distFiberStart);
                                const distEndRibbon = getRibbonNumber(distFiberEnd);
                                
                                // Find which ribbons this circuit spans on feed side
                                const feedStartRibbon = getRibbonNumber(feedFiberStart);
                                const feedEndRibbon = getRibbonNumber(feedFiberEnd);
                                
                                // Process each group of fibers that share the same ribbon pair
                                let currentDistFiber = distFiberStart;
                                let currentFeedFiber = feedFiberStart;
                                
                                while (currentDistFiber <= distFiberEnd) {
                                  const currentDistRibbon = getRibbonNumber(currentDistFiber);
                                  const currentFeedRibbon = getRibbonNumber(currentFeedFiber);
                                  
                                  // Find end of current ribbon segment for distribution
                                  const distRibbonEnd = currentDistRibbon * ribbonSize;
                                  const distSegmentEnd = Math.min(distRibbonEnd, distFiberEnd);
                                  
                                  // Find end of current ribbon segment for feed
                                  const feedRibbonEnd = currentFeedRibbon * ribbonSize;
                                  const feedSegmentEnd = Math.min(feedRibbonEnd, feedFiberEnd);
                                  
                                  // Calculate how many fibers in this segment
                                  const distFiberCount = distSegmentEnd - currentDistFiber + 1;
                                  const feedFiberCount = feedSegmentEnd - currentFeedFiber + 1;
                                  const segmentFiberCount = Math.min(distFiberCount, feedFiberCount);
                                  
                                  // Calculate circuit IDs for this segment
                                  const fiberOffset = currentDistFiber - distFiberStart;
                                  const circuitStart = rangeStart + fiberOffset;
                                  const circuitEnd = circuitStart + segmentFiberCount - 1;
                                  
                                  // Get strand positions
                                  const distStrandStart = getFiberPositionInRibbon(currentDistFiber);
                                  const distStrandEnd = getFiberPositionInRibbon(currentDistFiber + segmentFiberCount - 1);
                                  const feedStrandStart = getFiberPositionInRibbon(currentFeedFiber);
                                  const feedStrandEnd = getFiberPositionInRibbon(currentFeedFiber + segmentFiberCount - 1);
                                  
                                  const feedRibbonColor = getColorForRibbon(currentFeedRibbon);
                                  const distRibbonColor = getColorForRibbon(currentDistRibbon);
                                  
                                  const feedStrandStartColor = getColorForStrand(feedStrandStart);
                                  const feedStrandEndColor = getColorForStrand(feedStrandEnd);
                                  const distStrandStartColor = getColorForStrand(distStrandStart);
                                  const distStrandEndColor = getColorForStrand(distStrandEnd);
                                  
                                  ribbonRows.push(
                                    <TableRow key={`${circuit.id}-segment-${currentDistFiber}`} className={rowBgColor} data-testid={`row-ribbon-${circuit.id}-${currentDistFiber}`}>
                                      <TableCell className="text-center font-mono text-sm">{feedCable.name} - {feedCable.fiberCount}</TableCell>
                                      <TableCell className="text-center">
                                        <div className="inline-flex gap-1 items-center justify-center">
                                          <span className={`inline-block px-2 py-1 rounded border-2 border-black ${feedRibbonColor.bg} ${feedRibbonColor.text} font-mono font-semibold text-xs`}>
                                            R{currentFeedRibbon}
                                          </span>
                                          <span className={`inline-block px-2 py-1 rounded border-2 border-black ${feedStrandStartColor.bg} ${feedStrandStartColor.text} font-mono font-semibold text-xs`}>
                                            {feedStrandStart}
                                          </span>
                                          {feedStrandStart !== feedStrandEnd && (
                                            <span className={`inline-block px-2 py-1 rounded border-2 border-black ${feedStrandEndColor.bg} ${feedStrandEndColor.text} font-mono font-semibold text-xs`}>
                                              {feedStrandEnd}
                                            </span>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-center font-mono font-semibold">{circuitPrefix},{circuitStart}-{circuitEnd}</TableCell>
                                      <TableCell className="text-center">
                                        <div className="inline-flex gap-1 items-center justify-center">
                                          <span className={`inline-block px-2 py-1 rounded border-2 border-black ${distRibbonColor.bg} ${distRibbonColor.text} font-mono font-semibold text-xs`}>
                                            R{currentDistRibbon}
                                          </span>
                                          <span className={`inline-block px-2 py-1 rounded border-2 border-black ${distStrandStartColor.bg} ${distStrandStartColor.text} font-mono font-semibold text-xs`}>
                                            {distStrandStart}
                                          </span>
                                          {distStrandStart !== distStrandEnd && (
                                            <span className={`inline-block px-2 py-1 rounded border-2 border-black ${distStrandEndColor.bg} ${distStrandEndColor.text} font-mono font-semibold text-xs`}>
                                              {distStrandEnd}
                                            </span>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-center font-mono text-sm">{distributionCable?.name} - {distributionCable?.fiberCount}</TableCell>
                                    </TableRow>
                                  );
                                  
                                  // Move to next segment
                                  currentDistFiber += segmentFiberCount;
                                  currentFeedFiber += segmentFiberCount;
                                }
                                
                                return ribbonRows;
                              } else {
                                // Fiber view: show one row per fiber (original behavior)
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
                                  
                                  fiberRows.push(
                                    <TableRow key={`${circuit.id}-fiber-${i}`} className={rowBgColor} data-testid={`row-fiber-${circuit.id}-${i}`}>
                                      <TableCell className="text-center font-mono text-sm">{feedCable.name} - {feedCable.fiberCount}</TableCell>
                                      <TableCell className="text-center font-mono font-semibold">R{feedRibbon}</TableCell>
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
                                      <TableCell className="text-center font-mono font-semibold">R{distRibbon}</TableCell>
                                      <TableCell className="text-center font-mono text-sm">{distributionCable?.name} - {distributionCable?.fiberCount}</TableCell>
                                    </TableRow>
                                  );
                                }
                                
                                return fiberRows;
                              }
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            );
          })}
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

      <AlertDialog open={startNewDialogOpen} onOpenChange={setStartNewDialogOpen}>
        <AlertDialogContent data-testid="dialog-start-new-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Start New Project</AlertDialogTitle>
            <AlertDialogDescription>
              Your current project will be automatically saved with a date/time stamp. 
              All current cables and circuits will be cleared to start fresh.
              Are you sure you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-start-new-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => startNewMutation.mutate()}
              data-testid="button-start-new-confirm"
            >
              Save & Start New
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent data-testid="dialog-reset-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Reset All Data</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all cables and circuits without saving. 
              This action cannot be undone.
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

      <HistoryDialog 
        open={historyDialogOpen} 
        onOpenChange={setHistoryDialogOpen} 
      />

    </div>
  );
}
