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
import { Plus, Cable as CableIcon, Workflow, Save, Upload } from "lucide-react";
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
    onError: (error: any) => {
      // If cable doesn't exist (404), still remove from UI
      if (error?.message?.includes("not found") || error?.message?.includes("404")) {
        queryClient.invalidateQueries({ queryKey: ["/api/cables"] });
        queryClient.invalidateQueries({ queryKey: ["/api/circuits"] });
        toast({ title: "Cable removed from display" });
      } else {
        toast({ title: "Failed to delete cable", variant: "destructive" });
      }
    },
  });

  const handleSave = () => {
    const projectData = {
      cables,
      circuits: allCircuits,
    };
    
    const dataStr = JSON.stringify(projectData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fiber-splice-project-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast({ title: "Project saved to file" });
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
        
        // Load the data by making API calls
        for (const cable of projectData.cables) {
          await apiRequest("POST", "/api/cables", {
            name: cable.name,
            fiberCount: cable.fiberCount,
            ribbonSize: cable.ribbonSize,
            type: cable.type,
          });
        }
        
        // Refetch cables to get new IDs
        const newCables = await queryClient.fetchQuery({ queryKey: ["/api/cables"] }) as Cable[];
        
        // Map old cable IDs to new cable IDs
        const cableIdMap = new Map<string, string>();
        projectData.cables.forEach((oldCable: Cable, index: number) => {
          const newCable = newCables.find(c => 
            c.name === oldCable.name && 
            c.fiberCount === oldCable.fiberCount && 
            c.type === oldCable.type
          );
          if (newCable) {
            cableIdMap.set(oldCable.id, newCable.id);
          }
        });
        
        // Load circuits with new cable IDs
        for (const circuit of projectData.circuits) {
          const newCableId = cableIdMap.get(circuit.cableId);
          const newFeedCableId = circuit.feedCableId ? cableIdMap.get(circuit.feedCableId) : null;
          
          if (newCableId) {
            await apiRequest("POST", "/api/circuits", {
              cableId: newCableId,
              circuitId: circuit.circuitId,
              position: circuit.position,
              fiberStart: circuit.fiberStart,
              fiberEnd: circuit.fiberEnd,
              isSpliced: circuit.isSpliced,
              feedCableId: newFeedCableId,
              feedFiberStart: circuit.feedFiberStart,
              feedFiberEnd: circuit.feedFiberEnd,
            });
          }
        }
        
        queryClient.invalidateQueries({ queryKey: ["/api/cables"] });
        queryClient.invalidateQueries({ queryKey: ["/api/circuits"] });
        
        toast({ title: "Project loaded successfully" });
      } catch (error) {
        console.error('Load error:', error);
        toast({ title: "Failed to load project file", variant: "destructive" });
      }
    };
    input.click();
  };

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
              <h1 className="text-xl font-semibold">Fiber Splice Manager</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleLoad}
                data-testid="button-load"
              >
                <Upload className="h-4 w-4 mr-2" />
                Load
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleSave}
                data-testid="button-save"
              >
                <Save className="h-4 w-4 mr-2" />
                Save
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
                              
                              const ribbonSize = 12;
                              const getRibbonNumber = (fiber: number) => Math.ceil(fiber / ribbonSize);
                              const getFiberPositionInRibbon = (fiber: number) => ((fiber - 1) % ribbonSize) + 1;
                              const getColorForStrand = (strand: number) => fiberColors[(strand - 1) % 12];
                              const getColorForRibbon = (ribbon: number) => fiberColors[(ribbon - 1) % 12];
                              
                              // Parse circuit ID to get the circuit numbers
                              const circuitIdParts = circuit.circuitId.split(',');
                              const circuitPrefix = circuitIdParts[0] || "";
                              const circuitRange = circuitIdParts[1] || "";
                              const rangeParts = circuitRange.split('-');
                              
                              // Safety check for valid circuit ID format
                              if (rangeParts.length !== 2 || !rangeParts[0] || !rangeParts[1]) {
                                return [(
                                  <TableRow key={circuit.id} className={rowBgColor} data-testid={`row-spliced-circuit-${circuit.id}`}>
                                    <TableCell colSpan={allFullRibbons ? 5 : 7} className="text-center text-muted-foreground">
                                      Circuit {circuit.circuitId} in {distributionCable?.name} - Invalid circuit ID format.
                                    </TableCell>
                                  </TableRow>
                                )];
                              }
                              
                              const rangeStart = parseInt(rangeParts[0].trim());
                              const rangeEnd = parseInt(rangeParts[1].trim());
                              
                              // Safety check for valid numbers
                              if (isNaN(rangeStart) || isNaN(rangeEnd)) {
                                return [(
                                  <TableRow key={circuit.id} className={rowBgColor} data-testid={`row-spliced-circuit-${circuit.id}`}>
                                    <TableCell colSpan={allFullRibbons ? 5 : 7} className="text-center text-muted-foreground">
                                      Circuit {circuit.circuitId} in {distributionCable?.name} - Invalid circuit number range.
                                    </TableCell>
                                  </TableRow>
                                )];
                              }
                              
                              if (allFullRibbons) {
                                // Full ribbon view: show based on actual fiber positions
                                // Need to handle circuits that may span multiple ribbons
                                const ribbonRows = [];
                                
                                // Group fibers by ribbon for both feed and distribution
                                const distFiberStart = circuit.fiberStart;
                                const distFiberEnd = circuit.fiberEnd;
                                const feedFiberStart = circuit.feedFiberStart || circuit.fiberStart;
                                const feedFiberEnd = circuit.feedFiberEnd || circuit.fiberEnd;
                                
                                // Safety check for valid fiber positions
                                if (!distFiberStart || !distFiberEnd || !feedFiberStart || !feedFiberEnd ||
                                    isNaN(distFiberStart) || isNaN(distFiberEnd) || isNaN(feedFiberStart) || isNaN(feedFiberEnd)) {
                                  return [(
                                    <TableRow key={circuit.id} className={rowBgColor} data-testid={`row-spliced-circuit-${circuit.id}`}>
                                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                                        Circuit {circuit.circuitId} in {distributionCable?.name} - Invalid fiber positions.
                                      </TableCell>
                                    </TableRow>
                                  )];
                                }
                                
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
                                  
                                  ribbonRows.push(
                                    <TableRow key={`${circuit.id}-segment-${currentDistFiber}`} className={rowBgColor} data-testid={`row-ribbon-${circuit.id}-${currentDistFiber}`}>
                                      <TableCell className="text-center font-mono text-sm">{feedCable.name} - {feedCable.fiberCount}</TableCell>
                                      <TableCell className={`text-center font-mono font-semibold ${feedRibbonColor.colorClass}`}>
                                        R{currentFeedRibbon}:{feedStrandStart}{feedStrandStart !== feedStrandEnd ? `-${feedStrandEnd}` : ''}
                                      </TableCell>
                                      <TableCell className="text-center font-mono font-semibold">{circuitPrefix},{circuitStart}-{circuitEnd}</TableCell>
                                      <TableCell className={`text-center font-mono font-semibold ${distRibbonColor.colorClass}`}>
                                        R{currentDistRibbon}:{distStrandStart}{distStrandStart !== distStrandEnd ? `-${distStrandEnd}` : ''}
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
                                
                                // Safety check for valid fiber positions
                                if (!circuit.fiberStart || !circuit.fiberEnd || isNaN(circuit.fiberStart) || isNaN(circuit.fiberEnd)) {
                                  return [(
                                    <TableRow key={circuit.id} className={rowBgColor} data-testid={`row-spliced-circuit-${circuit.id}`}>
                                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                                        Circuit {circuit.circuitId} in {distributionCable?.name} - Invalid fiber positions.
                                      </TableCell>
                                    </TableRow>
                                  )];
                                }
                                
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
                                  const feedRibbonColor = getColorForRibbon(feedRibbon);
                                  const distRibbonColor = getColorForRibbon(distRibbon);
                                  
                                  fiberRows.push(
                                    <TableRow key={`${circuit.id}-fiber-${i}`} className={rowBgColor} data-testid={`row-fiber-${circuit.id}-${i}`}>
                                      <TableCell className="text-center font-mono text-sm">{feedCable.name} - {feedCable.fiberCount}</TableCell>
                                      <TableCell className={`text-center font-mono font-semibold ${feedRibbonColor.colorClass}`}>R{feedRibbon}</TableCell>
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
                                      <TableCell className={`text-center font-mono font-semibold ${distRibbonColor.colorClass}`}>R{distRibbon}</TableCell>
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


    </div>
  );
}
