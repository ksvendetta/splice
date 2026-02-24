import { useState, useMemo } from "react";
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
import { Plus, Cable as CableIcon, Workflow, Save, Upload, RotateCcw, Edit2, Check, X, Trash2, Layers, Home as HomeIcon, Phone, Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Switch as ToggleSwitch } from "@/components/ui/switch";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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

export default function Home({ mode, setMode }: { mode: "fiber" | "copper"; setMode: (mode: "fiber" | "copper") => void }) {
  const { toast } = useToast();
  const [selectedCableId, setSelectedCableId] = useState<string | null>(null);
  const [cableDialogOpen, setCableDialogOpen] = useState(false);
  const [editingCable, setEditingCable] = useState<Cable | null>(null);
  const [editingType, setEditingType] = useState(false);
  const [editingSize, setEditingSize] = useState(false);
  const [tempType, setTempType] = useState<"Feed" | "Distribution">("Feed");
  const [tempSize, setTempSize] = useState<number>(144);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveFileName, setSaveFileName] = useState("");
  const [useRibbonView, setUseRibbonView] = useState(true);

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

  // Sort cables: Feed first, then Distribution (maintaining insertion order within each type)
  const sortedCables = useMemo(() => {
    const feedCables = cables.filter(c => c.type === "Feed");
    const distributionCables = cables.filter(c => c.type === "Distribution");
    return [...feedCables, ...distributionCables];
  }, [cables]);

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
      setResetDialogOpen(false);
      toast({ title: "All data has been reset" });
    },
    onError: () => {
      toast({ title: "Failed to reset data", variant: "destructive" });
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
      : `fiber-splice-project-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    
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

  // Get all Feed cables for creating splice tabs
  const feedCables = useMemo(() => {
    return cables.filter(c => c.type === "Feed");
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
                onClick={handleSaveClick}
                data-testid="button-save"
              >
                <Save className="h-4 w-4 mr-2" />
                Save
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
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-6">
        <Tabs defaultValue="input" className="w-full">
          {/* Tab Navigation with Section Labels */}
          <div className="mb-6">
            <TabsList data-testid="tabs-main" className="w-full justify-start bg-transparent p-0">
              {/* Home Section - No Header */}
              <div className="inline-flex flex-col">
                <div className="h-6 mb-2"></div>
                <TabsTrigger value="input" data-testid="tab-input-data">
                  <HomeIcon className="h-4 w-4 mr-2" />
                  Home
                </TabsTrigger>
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
                  </>
                );
              })()}

              {/* Cable Splice Section with Header */}
              {(distributionCables.length > 0 || feedCables.length > 0) && (
                <>
                  <div className="h-8 w-0.5 bg-border mx-3 self-end" />
                  <div className="inline-flex flex-col">
                    <div className="text-center border-x-2 border-border bg-muted/30 px-6 py-1 rounded-t mb-2">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                        Splice by Cable
                      </h3>
                    </div>
                    <div className="inline-flex">
                      {distributionCables.map((distCable) => (
                        <TabsTrigger
                          key={distCable.id}
                          value={`splice-${distCable.id}`}
                          data-testid={`tab-splice-${distCable.id}`}
                        >
                          <CableIcon className="h-4 w-4 mr-2" />
                          {distCable.name}
                        </TabsTrigger>
                      ))}
                      {feedCables.map((feedCable) => (
                        <TabsTrigger
                          key={`feed-${feedCable.id}`}
                          value={`feed-splice-${feedCable.id}`}
                          data-testid={`tab-feed-splice-${feedCable.id}`}
                        >
                          <CableIcon className="h-4 w-4 mr-2" />
                          {feedCable.name}
                        </TabsTrigger>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </TabsList>
          </div>

          <TabsContent value="input" className="space-y-6">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                {cablesLoading ? (
                  <div className="text-muted-foreground">Loading cables...</div>
                ) : sortedCables.length === 0 ? (
                  <div className="text-muted-foreground" data-testid="text-no-cables">
                    No cables yet. Add a cable to get started.
                  </div>
                ) : (
                  sortedCables.map((cable) => {
                    const cableCircuits = allCircuits.filter(c => c.cableId === cable.id);
                    const totalAssignedFibers = cableCircuits.reduce((sum, circuit) => {
                      return sum + (circuit.fiberEnd - circuit.fiberStart + 1);
                    }, 0);
                    const isValid = totalAssignedFibers === cable.fiberCount;
                    
                    const typeColorClass = cable.type === "Feed" 
                      ? "bg-green-100 dark:bg-green-950/50 hover:bg-green-200 dark:hover:bg-green-900/50" 
                      : "bg-blue-100 dark:bg-blue-950/50 hover:bg-blue-200 dark:hover:bg-blue-900/50";
                    
                    return (
                      <Button
                        key={cable.id}
                        variant={selectedCableId === cable.id ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedCableId(cable.id)}
                        className={`flex items-center gap-2 ${selectedCableId !== cable.id ? typeColorClass : ''}`}
                        data-testid={`button-cable-${cable.id}`}
                      >
                        <CableIcon className="h-4 w-4" />
                        <span>{cable.name}</span>
                        <span className="text-xs opacity-70">({cable.fiberCount})</span>
                        <span className={`ml-1 text-xs px-1.5 py-0.5 rounded ${isValid ? 'bg-green-500/20 text-green-600 dark:text-green-400' : 'bg-red-500/20 text-red-600 dark:text-red-400'}`}>
                          {isValid ? 'Pass' : 'Fail'}
                        </span>
                      </Button>
                    );
                  })
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingCable(null);
                    setCableDialogOpen(true);
                  }}
                  data-testid="button-add-cable"
                  className="border-dashed"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Cable
                </Button>
              </div>

              <div>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-4">
                    <CardTitle>
                      {selectedCable ? `Cable: ${selectedCable.name}` : "Select a cable"}
                    </CardTitle>
                    {selectedCable && (
                      <div className="flex items-center gap-2">
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
                      </div>
                    )}
                  </CardHeader>
                  <CardContent>
                    {selectedCable ? (
                      <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4 text-sm">
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
                                  min="12"
                                  step="12"
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

                        <CircuitManagement cable={selectedCable} mode={mode} />
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
            
            // Helper to extract range start from circuit ID
            const getRangeStart = (circuitId: string): number => {
              const parts = circuitId.split(',');
              if (parts.length < 2) return 0;
              const rangePart = parts[1]?.trim() || '';
              const rangeParts = rangePart.split('-');
              return parseInt(rangeParts[0]?.trim() || '0') || 0;
            };
            
            return prefixes.map(prefix => {
              // Sort circuits by their range start number
              const prefixCircuits = [...groupedByPrefix[prefix]].sort((a, b) => {
                return getRangeStart(a.circuitId) - getRangeStart(b.circuitId);
              });

              // Calculate total rows by actually counting them
              let totalSpliceRows = 0;
              console.log(`[SPLICE COUNT] Prefix: ${prefix}, Circuits:`, prefixCircuits.length);
              prefixCircuits.forEach((circuit, idx) => {
                const feedFiberStart = circuit.feedFiberStart || circuit.fiberStart;
                const feedFiberEnd = circuit.feedFiberEnd || circuit.fiberEnd;
                console.log(`[SPLICE COUNT] Circuit ${idx} (${circuit.circuitId}): feedFiberStart=${feedFiberStart}, feedFiberEnd=${feedFiberEnd}`);

                if (!feedFiberStart || !feedFiberEnd) {
                  totalSpliceRows++;
                  return;
                }

                if (useRibbonView) {
                  const distFiberStart = circuit.fiberStart;
                  const distFiberEnd = circuit.fiberEnd;

                  let currentDistFiber = distFiberStart;
                  let currentFeedFiber = feedFiberStart;
                  let rowsForThisCircuit = 0;

                  while (currentDistFiber <= distFiberEnd) {
                    const currentDistRibbon = getRibbonNumber(currentDistFiber);
                    const currentFeedRibbon = getRibbonNumber(currentFeedFiber);

                    const distRibbonEnd = currentDistRibbon * ribbonSize;
                    const distSegmentEnd = Math.min(distRibbonEnd, distFiberEnd);
                    const feedRibbonEnd = currentFeedRibbon * ribbonSize;
                    const feedSegmentEnd = Math.min(feedRibbonEnd, feedFiberEnd);

                    const distFiberCount = distSegmentEnd - currentDistFiber + 1;
                    const feedFiberCount = feedSegmentEnd - currentFeedFiber + 1;
                    const segmentFiberCount = Math.min(distFiberCount, feedFiberCount);

                    rowsForThisCircuit++;
                    totalSpliceRows++;

                    currentDistFiber += segmentFiberCount;
                    currentFeedFiber += segmentFiberCount;
                  }
                  console.log(`[SPLICE COUNT] Circuit ${idx} generated ${rowsForThisCircuit} rows`);
                } else {
                  totalSpliceRows += (feedFiberEnd - feedFiberStart + 1);
                }
              });
              console.log(`[SPLICE COUNT] Total rows for prefix ${prefix}: ${totalSpliceRows}`);

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
                        <div className="rounded-md border overflow-x-auto inline-block">
                          <Table className="text-sm w-auto">
                            <TableHeader>
                              <TableRow className="bg-muted/50">
                                <TableHead rowSpan={3} className="text-center font-semibold py-1 px-2 whitespace-nowrap align-middle">#</TableHead>
                                <TableHead colSpan={useRibbonView ? 2 : 3} rowSpan={2} className="text-center font-semibold bg-green-100 dark:bg-green-950/50 py-1 px-2 align-middle">Feed</TableHead>
                                <TableHead className="text-center py-1 px-2">
                                  <div className="flex items-center justify-center gap-1">
                                    <Label htmlFor={`view-toggle-prefix-${prefix}`} className="text-xs text-muted-foreground">Strands</Label>
                                    <Switch
                                      id={`view-toggle-prefix-${prefix}`}
                                      checked={useRibbonView}
                                      onCheckedChange={setUseRibbonView}
                                      data-testid={`switch-view-mode-prefix-${prefix}`}
                                      className="scale-75"
                                    />
                                    <Label htmlFor={`view-toggle-prefix-${prefix}`} className="text-xs text-muted-foreground">Ribbons</Label>
                                  </div>
                                </TableHead>
                                <TableHead colSpan={useRibbonView ? 2 : 3} rowSpan={2} className="text-center font-semibold bg-blue-100 dark:bg-blue-950/50 py-1 px-2 align-middle">Distribution</TableHead>
                              </TableRow>
                              <TableRow className="bg-muted/50">
                                <TableHead className="text-center font-semibold py-1 px-2 whitespace-nowrap">Splices : {totalSpliceRows}</TableHead>
                              </TableRow>
                              <TableRow>
                                <TableHead className="text-center py-1 px-2 whitespace-nowrap">Cable</TableHead>
                                <TableHead className="text-center py-1 px-2 whitespace-nowrap">Ribbon</TableHead>
                                {!useRibbonView && <TableHead className="text-center py-1 px-2 whitespace-nowrap">Strand</TableHead>}
                                <TableHead className="text-center py-1 px-2 whitespace-nowrap">Circuit</TableHead>
                                {!useRibbonView && <TableHead className="text-center py-1 px-2 whitespace-nowrap">Strand</TableHead>}
                                <TableHead className="text-center py-1 px-2 whitespace-nowrap">Ribbon</TableHead>
                                <TableHead className="text-center py-1 px-2 whitespace-nowrap">Cable</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(() => {
                                let rowNumber = 0;
                                return prefixCircuits.flatMap((circuit, circuitIndex) => {
                                  const distributionCable = cables.find((c) => c.id === circuit.cableId);
                                  const feedCable = circuit.feedCableId ? cables.find((c) => c.id === circuit.feedCableId) : undefined;
                                  
                                  const rowBgColor = circuitIndex % 2 === 0 
                                    ? "bg-white dark:bg-background" 
                                    : "bg-gray-200 dark:bg-muted/50";
                                  
                                  if (!feedCable) {
                                    rowNumber++;
                                    return [(
                                      <TableRow key={circuit.id} className={rowBgColor}>
                                        <TableCell className="text-center font-mono py-1 px-2">{rowNumber}</TableCell>
                                        <TableCell colSpan={useRibbonView ? 4 : 6} className="text-center text-muted-foreground">
                                          Circuit {circuit.circuitId} - No feed cable selected.
                                        </TableCell>
                                      </TableRow>
                                    )];
                                  }
                                  
                                  const circuitIdParts = circuit.circuitId.split(',');
                                  const circuitPrefix = circuitIdParts[0] || "";
                                  const circuitRange = circuitIdParts[1] || "";
                                  const rangeParts = circuitRange.split('-');
                                  
                                  if (rangeParts.length !== 2 || !rangeParts[0] || !rangeParts[1]) {
                                    rowNumber++;
                                    return [(
                                      <TableRow key={circuit.id} className={rowBgColor}>
                                        <TableCell className="text-center font-mono py-1 px-2">{rowNumber}</TableCell>
                                        <TableCell colSpan={useRibbonView ? 4 : 6} className="text-center text-muted-foreground">
                                          Circuit {circuit.circuitId} - Invalid format.
                                        </TableCell>
                                      </TableRow>
                                  )];
                                }
                                
                                  const rangeStart = parseInt(rangeParts[0].trim());
                                  const rangeEnd = parseInt(rangeParts[1].trim());
                                  
                                  if (isNaN(rangeStart) || isNaN(rangeEnd)) {
                                    rowNumber++;
                                    return [(
                                      <TableRow key={circuit.id} className={rowBgColor}>
                                        <TableCell className="text-center font-mono py-1 px-2">{rowNumber}</TableCell>
                                        <TableCell colSpan={useRibbonView ? 4 : 6} className="text-center text-muted-foreground">
                                          Circuit {circuit.circuitId} - Invalid range.
                                        </TableCell>
                                      </TableRow>
                                    )];
                                  }
                                  
                                  if (useRibbonView) {
                                    const ribbonRows = [];
                                    const distFiberStart = circuit.fiberStart;
                                    const distFiberEnd = circuit.fiberEnd;
                                    const feedFiberStart = circuit.feedFiberStart || circuit.fiberStart;
                                    const feedFiberEnd = circuit.feedFiberEnd || circuit.fiberEnd;
                                    
                                    if (!distFiberStart || !distFiberEnd || !feedFiberStart || !feedFiberEnd) {
                                      rowNumber++;
                                      return [(
                                        <TableRow key={circuit.id} className={rowBgColor}>
                                          <TableCell className="text-center font-mono py-1 px-2">{rowNumber}</TableCell>
                                          <TableCell colSpan={4} className="text-center text-muted-foreground">
                                            Circuit {circuit.circuitId} - Invalid fiber positions.
                                          </TableCell>
                                        </TableRow>
                                      )];
                                    }
                                    
                                    let currentDistFiber = distFiberStart;
                                    let currentFeedFiber = feedFiberStart;
                                    
                                    while (currentDistFiber <= distFiberEnd) {
                                      const currentDistRibbon = getRibbonNumber(currentDistFiber);
                                      const currentFeedRibbon = getRibbonNumber(currentFeedFiber);
                                      
                                      const distRibbonEnd = currentDistRibbon * ribbonSize;
                                      const distSegmentEnd = Math.min(distRibbonEnd, distFiberEnd);
                                      const feedRibbonEnd = currentFeedRibbon * ribbonSize;
                                      const feedSegmentEnd = Math.min(feedRibbonEnd, feedFiberEnd);
                                      
                                      const distFiberCount = distSegmentEnd - currentDistFiber + 1;
                                      const feedFiberCount = feedSegmentEnd - currentFeedFiber + 1;
                                      const segmentFiberCount = Math.min(distFiberCount, feedFiberCount);
                                      
                                      const fiberOffset = currentDistFiber - distFiberStart;
                                      const circuitStart = rangeStart + fiberOffset;
                                      const circuitEnd = circuitStart + segmentFiberCount - 1;
                                      
                                      const distStrandStart = getFiberPositionInRibbon(currentDistFiber);
                                      const distStrandEnd = getFiberPositionInRibbon(currentDistFiber + segmentFiberCount - 1);
                                      const feedStrandStart = getFiberPositionInRibbon(currentFeedFiber);
                                      const feedStrandEnd = getFiberPositionInRibbon(currentFeedFiber + segmentFiberCount - 1);
                                      
                                      const feedRibbonColor = getColorForRibbon(currentFeedRibbon);
                                      const distRibbonColor = getColorForRibbon(currentDistRibbon);
                                      
                                      rowNumber++;
                                      ribbonRows.push(
                                        <TableRow key={`${circuit.id}-segment-${currentDistFiber}`} className={rowBgColor}>
                                          <TableCell className="text-center font-mono py-1 px-2">{rowNumber}</TableCell>
                                          <TableCell className="text-center font-mono py-1 px-2 whitespace-nowrap">{feedCable.name}-{feedCable.fiberCount}</TableCell>
                                          <TableCell className={`text-center font-mono font-semibold py-1 px-2 whitespace-nowrap ${feedRibbonColor.colorClass}`}>
                                            R{currentFeedRibbon}:{feedStrandStart}{feedStrandStart !== feedStrandEnd ? `-${feedStrandEnd}` : ''}
                                          </TableCell>
                                          <TableCell className="text-center font-mono font-semibold py-1 px-2 whitespace-nowrap">{circuitPrefix},{circuitStart}-{circuitEnd}</TableCell>
                                          <TableCell className={`text-center font-mono font-semibold py-1 px-2 whitespace-nowrap ${distRibbonColor.colorClass}`}>
                                            R{currentDistRibbon}:{distStrandStart}{distStrandStart !== distStrandEnd ? `-${distStrandEnd}` : ''}
                                          </TableCell>
                                          <TableCell className="text-center font-mono py-1 px-2 whitespace-nowrap">{distributionCable?.name}-{distributionCable?.fiberCount}</TableCell>
                                        </TableRow>
                                      );
                                      
                                      currentDistFiber += segmentFiberCount;
                                      currentFeedFiber += segmentFiberCount;
                                    }
                                    
                                    return ribbonRows;
                                  } else {
                                    const fiberRows = [];
                                    
                                    if (!circuit.fiberStart || !circuit.fiberEnd) {
                                      rowNumber++;
                                      return [(
                                        <TableRow key={circuit.id} className={rowBgColor}>
                                          <TableCell className="text-center font-mono py-1 px-2">{rowNumber}</TableCell>
                                          <TableCell colSpan={6} className="text-center text-muted-foreground">
                                            Circuit {circuit.circuitId} - Invalid fiber positions.
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
                                      
                                      rowNumber++;
                                      fiberRows.push(
                                        <TableRow key={`${circuit.id}-fiber-${i}`} className={rowBgColor}>
                                          <TableCell className="text-center font-mono py-1 px-2">{rowNumber}</TableCell>
                                          <TableCell className="text-center font-mono py-1 px-2 whitespace-nowrap">{feedCable.name}-{feedCable.fiberCount}</TableCell>
                                          <TableCell className={`text-center font-mono font-semibold py-1 px-2 whitespace-nowrap ${feedRibbonColor.colorClass}`}>R{feedRibbon}</TableCell>
                                          <TableCell className="text-center py-1 px-2">
                                            <div className={`inline-block px-1.5 py-0.5 rounded border border-black ${feedColor.bg} ${feedColor.text} font-mono font-semibold text-xs`}>
                                              {feedStrand}
                                            </div>
                                          </TableCell>
                                          <TableCell className="text-center font-mono font-semibold py-1 px-2 whitespace-nowrap">{circuitPrefix},{circuitNumber}</TableCell>
                                          <TableCell className="text-center py-1 px-2">
                                            <div className={`inline-block px-1.5 py-0.5 rounded border border-black ${distColor.bg} ${distColor.text} font-mono font-semibold text-xs`}>
                                              {distStrand}
                                            </div>
                                          </TableCell>
                                          <TableCell className={`text-center font-mono font-semibold py-1 px-2 whitespace-nowrap ${distRibbonColor.colorClass}`}>R{distRibbon}</TableCell>
                                          <TableCell className="text-center font-mono py-1 px-2 whitespace-nowrap">{distributionCable?.name}-{distributionCable?.fiberCount}</TableCell>
                                        </TableRow>
                                      );
                                    }
                                    
                                    return fiberRows;
                                  }
                                });
                              })()}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              );
            });
          })()}

          {distributionCables.map((distCable) => {
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
            
            // Calculate total rows by matching the rendering logic exactly
            let totalSpliceRows = 0;
            cableSplicedCircuits.forEach((circuit) => {
              const distFiberStart = circuit.fiberStart;
              const distFiberEnd = circuit.fiberEnd;
              const feedFiberStart = circuit.feedFiberStart || circuit.fiberStart;
              const feedFiberEnd = circuit.feedFiberEnd || circuit.fiberEnd;

              if (!distFiberStart || !distFiberEnd || !feedFiberStart || !feedFiberEnd) {
                totalSpliceRows++;
                return;
              }

              if (useRibbonView) {
                let currentDistFiber = distFiberStart;
                let currentFeedFiber = feedFiberStart;

                while (currentDistFiber <= distFiberEnd) {
                  const currentDistRibbon = Math.ceil(currentDistFiber / 12);
                  const currentFeedRibbon = Math.ceil(currentFeedFiber / 12);

                  const distRibbonEnd = currentDistRibbon * 12;
                  const distSegmentEnd = Math.min(distRibbonEnd, distFiberEnd);
                  const feedRibbonEnd = currentFeedRibbon * 12;
                  const feedSegmentEnd = Math.min(feedRibbonEnd, feedFiberEnd);

                  const distFiberCount = distSegmentEnd - currentDistFiber + 1;
                  const feedFiberCount = feedSegmentEnd - currentFeedFiber + 1;
                  const segmentFiberCount = Math.min(distFiberCount, feedFiberCount);

                  totalSpliceRows++;

                  currentDistFiber += segmentFiberCount;
                  currentFeedFiber += segmentFiberCount;
                }
              } else {
                totalSpliceRows += (feedFiberEnd - feedFiberStart + 1);
              }
            });
            
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
                        No circuits marked as spliced yet for {distCable.name}. Check circuits in the Home tab.
                      </div>
                    ) : (
                      <div className="rounded-md border overflow-x-auto inline-block">
                        <Table className="text-sm w-auto">
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead rowSpan={3} className="text-center font-semibold py-1 px-2 whitespace-nowrap align-middle">#</TableHead>
                              <TableHead colSpan={useRibbonView ? 2 : 3} rowSpan={2} className="text-center font-semibold bg-green-100 dark:bg-green-950/50 py-1 px-2 align-middle">Feed</TableHead>
                              <TableHead className="text-center py-1 px-2">
                                <div className="flex items-center justify-center gap-1">
                                  <Label htmlFor={`view-toggle-${distCable.id}`} className="text-xs text-muted-foreground">Strands</Label>
                                  <Switch
                                    id={`view-toggle-${distCable.id}`}
                                    checked={useRibbonView}
                                    onCheckedChange={setUseRibbonView}
                                    data-testid={`switch-view-mode-${distCable.id}`}
                                    className="scale-75"
                                  />
                                  <Label htmlFor={`view-toggle-${distCable.id}`} className="text-xs text-muted-foreground">Ribbons</Label>
                                </div>
                              </TableHead>
                              <TableHead colSpan={useRibbonView ? 2 : 3} rowSpan={2} className="text-center font-semibold bg-blue-100 dark:bg-blue-950/50 py-1 px-2 align-middle">Distribution</TableHead>
                            </TableRow>
                            <TableRow className="bg-muted/50">
                              <TableHead className="text-center font-semibold py-1 px-2 whitespace-nowrap">Splices : {totalSpliceRows}</TableHead>
                            </TableRow>
                            <TableRow>
                              <TableHead className="text-center py-1 px-2 whitespace-nowrap">Cable</TableHead>
                              <TableHead className="text-center py-1 px-2 whitespace-nowrap">Ribbon</TableHead>
                              {!useRibbonView && <TableHead className="text-center py-1 px-2 whitespace-nowrap">Strand</TableHead>}
                              <TableHead className="text-center py-1 px-2 whitespace-nowrap">Circuit</TableHead>
                              {!useRibbonView && <TableHead className="text-center py-1 px-2 whitespace-nowrap">Strand</TableHead>}
                              <TableHead className="text-center py-1 px-2 whitespace-nowrap">Ribbon</TableHead>
                              <TableHead className="text-center py-1 px-2 whitespace-nowrap">Cable</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(() => {
                              let rowNumber = 0;
                              return cableSplicedCircuits.flatMap((circuit, circuitIndex) => {
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
                                      <TableCell colSpan={useRibbonView ? 4 : 6} className="text-center text-muted-foreground">
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
                                  rowNumber++;
                                  return [(
                                    <TableRow key={circuit.id} className={rowBgColor} data-testid={`row-spliced-circuit-${circuit.id}`}>
                                      <TableCell className="text-center font-mono py-1 px-2">{rowNumber}</TableCell>
                                      <TableCell colSpan={useRibbonView ? 4 : 6} className="text-center text-muted-foreground">
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
                                      <TableCell colSpan={useRibbonView ? 4 : 6} className="text-center text-muted-foreground">
                                        Circuit {circuit.circuitId} in {distributionCable?.name} - Invalid circuit number range.
                                      </TableCell>
                                    </TableRow>
                                  )];
                                }
                                
                                if (useRibbonView) {
                                  // Full ribbon view
                                  const ribbonRows = [];
                                  
                                  const distFiberStart = circuit.fiberStart;
                                  const distFiberEnd = circuit.fiberEnd;
                                  const feedFiberStart = circuit.feedFiberStart || circuit.fiberStart;
                                  const feedFiberEnd = circuit.feedFiberEnd || circuit.fiberEnd;
                                  
                                  if (!distFiberStart || !distFiberEnd || !feedFiberStart || !feedFiberEnd ||
                                      isNaN(distFiberStart) || isNaN(distFiberEnd) || isNaN(feedFiberStart) || isNaN(feedFiberEnd)) {
                                    rowNumber++;
                                    return [(
                                      <TableRow key={circuit.id} className={rowBgColor} data-testid={`row-spliced-circuit-${circuit.id}`}>
                                        <TableCell className="text-center font-mono py-1 px-2">{rowNumber}</TableCell>
                                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                                          Circuit {circuit.circuitId} in {distributionCable?.name} - Invalid fiber positions.
                                        </TableCell>
                                      </TableRow>
                                    )];
                                  }
                                  
                                  let currentDistFiber = distFiberStart;
                                  let currentFeedFiber = feedFiberStart;
                                  
                                  while (currentDistFiber <= distFiberEnd) {
                                    const currentDistRibbon = getRibbonNumber(currentDistFiber);
                                    const currentFeedRibbon = getRibbonNumber(currentFeedFiber);
                                    
                                    const distRibbonEnd = currentDistRibbon * ribbonSize;
                                    const distSegmentEnd = Math.min(distRibbonEnd, distFiberEnd);
                                    const feedRibbonEnd = currentFeedRibbon * ribbonSize;
                                    const feedSegmentEnd = Math.min(feedRibbonEnd, feedFiberEnd);
                                    
                                    const distFiberCount = distSegmentEnd - currentDistFiber + 1;
                                    const feedFiberCount = feedSegmentEnd - currentFeedFiber + 1;
                                    const segmentFiberCount = Math.min(distFiberCount, feedFiberCount);
                                    
                                    const fiberOffset = currentDistFiber - distFiberStart;
                                    const circuitStart = rangeStart + fiberOffset;
                                    const circuitEnd = circuitStart + segmentFiberCount - 1;
                                    
                                    const distStrandStart = getFiberPositionInRibbon(currentDistFiber);
                                    const distStrandEnd = getFiberPositionInRibbon(currentDistFiber + segmentFiberCount - 1);
                                    const feedStrandStart = getFiberPositionInRibbon(currentFeedFiber);
                                    const feedStrandEnd = getFiberPositionInRibbon(currentFeedFiber + segmentFiberCount - 1);
                                    
                                    const feedRibbonColor = getColorForRibbon(currentFeedRibbon);
                                    const distRibbonColor = getColorForRibbon(currentDistRibbon);
                                    
                                    rowNumber++;
                                    ribbonRows.push(
                                      <TableRow key={`${circuit.id}-segment-${currentDistFiber}`} className={rowBgColor} data-testid={`row-ribbon-${circuit.id}-${currentDistFiber}`}>
                                        <TableCell className="text-center font-mono py-1 px-2">{rowNumber}</TableCell>
                                        <TableCell className="text-center font-mono py-1 px-2 whitespace-nowrap">{feedCable.name}-{feedCable.fiberCount}</TableCell>
                                        <TableCell className={`text-center font-mono font-semibold py-1 px-2 whitespace-nowrap ${feedRibbonColor.colorClass}`}>
                                          R{currentFeedRibbon}:{feedStrandStart}{feedStrandStart !== feedStrandEnd ? `-${feedStrandEnd}` : ''}
                                        </TableCell>
                                        <TableCell className="text-center font-mono font-semibold py-1 px-2 whitespace-nowrap">{circuitPrefix},{circuitStart}-{circuitEnd}</TableCell>
                                        <TableCell className={`text-center font-mono font-semibold py-1 px-2 whitespace-nowrap ${distRibbonColor.colorClass}`}>
                                          R{currentDistRibbon}:{distStrandStart}{distStrandStart !== distStrandEnd ? `-${distStrandEnd}` : ''}
                                        </TableCell>
                                        <TableCell className="text-center font-mono py-1 px-2 whitespace-nowrap">{distributionCable?.name}-{distributionCable?.fiberCount}</TableCell>
                                      </TableRow>
                                    );
                                    
                                    currentDistFiber += segmentFiberCount;
                                    currentFeedFiber += segmentFiberCount;
                                  }
                                  
                                  return ribbonRows;
                                } else {
                                  // Fiber view
                                  const fiberRows = [];
                                  
                                  if (!circuit.fiberStart || !circuit.fiberEnd || isNaN(circuit.fiberStart) || isNaN(circuit.fiberEnd)) {
                                    rowNumber++;
                                    return [(
                                      <TableRow key={circuit.id} className={rowBgColor} data-testid={`row-spliced-circuit-${circuit.id}`}>
                                        <TableCell className="text-center font-mono py-1 px-2">{rowNumber}</TableCell>
                                        <TableCell colSpan={6} className="text-center text-muted-foreground">
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
                                    
                                    rowNumber++;
                                    fiberRows.push(
                                      <TableRow key={`${circuit.id}-fiber-${i}`} className={rowBgColor} data-testid={`row-fiber-${circuit.id}-${i}`}>
                                        <TableCell className="text-center font-mono py-1 px-2">{rowNumber}</TableCell>
                                        <TableCell className="text-center font-mono py-1 px-2 whitespace-nowrap">{feedCable.name}-{feedCable.fiberCount}</TableCell>
                                        <TableCell className={`text-center font-mono font-semibold py-1 px-2 whitespace-nowrap ${feedRibbonColor.colorClass}`}>R{feedRibbon}</TableCell>
                                        <TableCell className="text-center py-1 px-2">
                                          <div className={`inline-block px-1.5 py-0.5 rounded border border-black ${feedColor.bg} ${feedColor.text} font-mono font-semibold text-xs`}>
                                            {feedStrand}
                                          </div>
                                        </TableCell>
                                        <TableCell className="text-center font-mono font-semibold py-1 px-2 whitespace-nowrap">{circuitPrefix},{circuitNumber}</TableCell>
                                        <TableCell className="text-center py-1 px-2">
                                          <div className={`inline-block px-1.5 py-0.5 rounded border border-black ${distColor.bg} ${distColor.text} font-mono font-semibold text-xs`}>
                                            {distStrand}
                                          </div>
                                        </TableCell>
                                        <TableCell className={`text-center font-mono font-semibold py-1 px-2 whitespace-nowrap ${distRibbonColor.colorClass}`}>R{distRibbon}</TableCell>
                                        <TableCell className="text-center font-mono py-1 px-2 whitespace-nowrap">{distributionCable?.name}-{distributionCable?.fiberCount}</TableCell>
                                      </TableRow>
                                    );
                                  }
                                  
                                  return fiberRows;
                                }
                              });
                            })()}
                          </TableBody>
                        </Table>
                      </div>
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
            
            // Calculate total rows by matching the rendering logic exactly
            let totalSpliceRows = 0;
            feedSplicedCircuits.forEach((circuit) => {
              const distFiberStart = circuit.fiberStart;
              const distFiberEnd = circuit.fiberEnd;
              const feedFiberStart = circuit.feedFiberStart || circuit.fiberStart;
              const feedFiberEnd = circuit.feedFiberEnd || circuit.fiberEnd;

              if (!distFiberStart || !distFiberEnd || !feedFiberStart || !feedFiberEnd) {
                totalSpliceRows++;
                return;
              }

              if (useRibbonView) {
                let currentDistFiber = distFiberStart;
                let currentFeedFiber = feedFiberStart;

                while (currentDistFiber <= distFiberEnd) {
                  const currentDistRibbon = Math.ceil(currentDistFiber / 12);
                  const currentFeedRibbon = Math.ceil(currentFeedFiber / 12);

                  const distRibbonEnd = currentDistRibbon * 12;
                  const distSegmentEnd = Math.min(distRibbonEnd, distFiberEnd);
                  const feedRibbonEnd = currentFeedRibbon * 12;
                  const feedSegmentEnd = Math.min(feedRibbonEnd, feedFiberEnd);

                  const distFiberCount = distSegmentEnd - currentDistFiber + 1;
                  const feedFiberCount = feedSegmentEnd - currentFeedFiber + 1;
                  const segmentFiberCount = Math.min(distFiberCount, feedFiberCount);

                  totalSpliceRows++;

                  currentDistFiber += segmentFiberCount;
                  currentFeedFiber += segmentFiberCount;
                }
              } else {
                totalSpliceRows += (feedFiberEnd - feedFiberStart + 1);
              }
            });
            
            return (
              <TabsContent key={`feed-${feedCable.id}`} value={`feed-splice-${feedCable.id}`}>
                <Card>
                  <CardHeader>
                    <CardTitle>Splice Mapping - {feedCable.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {circuitsLoading ? (
                      <div className="text-center py-12 text-muted-foreground">Loading circuits...</div>
                    ) : feedSplicedCircuits.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground" data-testid={`text-no-feed-spliced-circuits-${feedCable.id}`}>
                        No Distribution circuits spliced to {feedCable.name} yet. Check circuits in Distribution cables.
                      </div>
                    ) : (
                      <div className="rounded-md border overflow-x-auto inline-block">
                        <Table className="text-sm w-auto">
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead rowSpan={3} className="text-center font-semibold py-1 px-2 whitespace-nowrap align-middle">#</TableHead>
                              <TableHead colSpan={useRibbonView ? 2 : 3} rowSpan={2} className="text-center font-semibold bg-green-100 dark:bg-green-950/50 py-1 px-2 align-middle">Feed</TableHead>
                              <TableHead className="text-center py-1 px-2">
                                <div className="flex items-center justify-center gap-1">
                                  <Label htmlFor={`view-toggle-feed-${feedCable.id}`} className="text-xs text-muted-foreground">Strands</Label>
                                  <Switch
                                    id={`view-toggle-feed-${feedCable.id}`}
                                    checked={useRibbonView}
                                    onCheckedChange={setUseRibbonView}
                                    data-testid={`switch-view-mode-feed-${feedCable.id}`}
                                    className="scale-75"
                                  />
                                  <Label htmlFor={`view-toggle-feed-${feedCable.id}`} className="text-xs text-muted-foreground">Ribbons</Label>
                                </div>
                              </TableHead>
                              <TableHead colSpan={useRibbonView ? 2 : 3} rowSpan={2} className="text-center font-semibold bg-blue-100 dark:bg-blue-950/50 py-1 px-2 align-middle">Distribution</TableHead>
                            </TableRow>
                            <TableRow className="bg-muted/50">
                              <TableHead className="text-center font-semibold py-1 px-2 whitespace-nowrap">Splices : {totalSpliceRows}</TableHead>
                            </TableRow>
                            <TableRow>
                              <TableHead className="text-center py-1 px-2 whitespace-nowrap">Cable</TableHead>
                              <TableHead className="text-center py-1 px-2 whitespace-nowrap">Ribbon</TableHead>
                              {!useRibbonView && <TableHead className="text-center py-1 px-2 whitespace-nowrap">Strand</TableHead>}
                              <TableHead className="text-center py-1 px-2 whitespace-nowrap">Circuit</TableHead>
                              {!useRibbonView && <TableHead className="text-center py-1 px-2 whitespace-nowrap">Strand</TableHead>}
                              <TableHead className="text-center py-1 px-2 whitespace-nowrap">Ribbon</TableHead>
                              <TableHead className="text-center py-1 px-2 whitespace-nowrap">Cable</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(() => {
                              let rowNumber = 0;
                              return feedSplicedCircuits.flatMap((circuit, circuitIndex) => {
                                const distributionCable = cables.find((c) => c.id === circuit.cableId);
                                
                                // Alternate background color based on circuit index
                                const rowBgColor = circuitIndex % 2 === 0 
                                  ? "bg-white dark:bg-background" 
                                  : "bg-gray-200 dark:bg-muted/50";
                                
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
                                  rowNumber++;
                                  return [(
                                    <TableRow key={circuit.id} className={rowBgColor} data-testid={`row-feed-spliced-circuit-${circuit.id}`}>
                                      <TableCell className="text-center font-mono py-1 px-2">{rowNumber}</TableCell>
                                      <TableCell colSpan={useRibbonView ? 4 : 6} className="text-center text-muted-foreground">
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
                                    <TableRow key={circuit.id} className={rowBgColor} data-testid={`row-feed-spliced-circuit-${circuit.id}`}>
                                      <TableCell className="text-center font-mono py-1 px-2">{rowNumber}</TableCell>
                                      <TableCell colSpan={useRibbonView ? 4 : 6} className="text-center text-muted-foreground">
                                        Circuit {circuit.circuitId} in {distributionCable?.name} - Invalid circuit number range.
                                      </TableCell>
                                    </TableRow>
                                  )];
                                }
                                
                                if (useRibbonView) {
                                  // Full ribbon view
                                  const ribbonRows = [];
                                  
                                  const distFiberStart = circuit.fiberStart;
                                  const distFiberEnd = circuit.fiberEnd;
                                  const feedFiberStart = circuit.feedFiberStart || circuit.fiberStart;
                                  const feedFiberEnd = circuit.feedFiberEnd || circuit.fiberEnd;
                                  
                                  // Safety check for valid fiber positions
                                  if (!distFiberStart || !distFiberEnd || !feedFiberStart || !feedFiberEnd ||
                                      isNaN(distFiberStart) || isNaN(distFiberEnd) || isNaN(feedFiberStart) || isNaN(feedFiberEnd)) {
                                    rowNumber++;
                                    return [(
                                      <TableRow key={circuit.id} className={rowBgColor} data-testid={`row-feed-spliced-circuit-${circuit.id}`}>
                                        <TableCell className="text-center font-mono py-1 px-2">{rowNumber}</TableCell>
                                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                                          Circuit {circuit.circuitId} in {distributionCable?.name} - Invalid fiber positions.
                                        </TableCell>
                                      </TableRow>
                                    )];
                                  }
                                  
                                  // Process each group of fibers that share the same ribbon pair
                                  let currentDistFiber = distFiberStart;
                                  let currentFeedFiber = feedFiberStart;
                                  
                                  while (currentDistFiber <= distFiberEnd) {
                                    const currentDistRibbon = getRibbonNumber(currentDistFiber);
                                    const currentFeedRibbon = getRibbonNumber(currentFeedFiber);
                                    
                                    const distRibbonEnd = currentDistRibbon * ribbonSize;
                                    const distSegmentEnd = Math.min(distRibbonEnd, distFiberEnd);
                                    
                                    const feedRibbonEnd = currentFeedRibbon * ribbonSize;
                                    const feedSegmentEnd = Math.min(feedRibbonEnd, feedFiberEnd);
                                    
                                    const distFiberCount = distSegmentEnd - currentDistFiber + 1;
                                    const feedFiberCount = feedSegmentEnd - currentFeedFiber + 1;
                                    const segmentFiberCount = Math.min(distFiberCount, feedFiberCount);
                                    
                                    const fiberOffset = currentDistFiber - distFiberStart;
                                    const circuitStart = rangeStart + fiberOffset;
                                    const circuitEnd = circuitStart + segmentFiberCount - 1;
                                    
                                    const distStrandStart = getFiberPositionInRibbon(currentDistFiber);
                                    const distStrandEnd = getFiberPositionInRibbon(currentDistFiber + segmentFiberCount - 1);
                                    const feedStrandStart = getFiberPositionInRibbon(currentFeedFiber);
                                    const feedStrandEnd = getFiberPositionInRibbon(currentFeedFiber + segmentFiberCount - 1);
                                    
                                    const feedRibbonColor = getColorForRibbon(currentFeedRibbon);
                                    const distRibbonColor = getColorForRibbon(currentDistRibbon);
                                    
                                    rowNumber++;
                                    ribbonRows.push(
                                      <TableRow key={`${circuit.id}-feed-segment-${currentDistFiber}`} className={rowBgColor} data-testid={`row-feed-ribbon-${circuit.id}-${currentDistFiber}`}>
                                        <TableCell className="text-center font-mono py-1 px-2">{rowNumber}</TableCell>
                                        <TableCell className="text-center font-mono py-1 px-2 whitespace-nowrap">{feedCable.name}-{feedCable.fiberCount}</TableCell>
                                        <TableCell className={`text-center font-mono font-semibold py-1 px-2 whitespace-nowrap ${feedRibbonColor.colorClass}`}>
                                          R{currentFeedRibbon}:{feedStrandStart}{feedStrandStart !== feedStrandEnd ? `-${feedStrandEnd}` : ''}
                                        </TableCell>
                                        <TableCell className="text-center font-mono font-semibold py-1 px-2 whitespace-nowrap">{circuitPrefix},{circuitStart}-{circuitEnd}</TableCell>
                                        <TableCell className={`text-center font-mono font-semibold py-1 px-2 whitespace-nowrap ${distRibbonColor.colorClass}`}>
                                          R{currentDistRibbon}:{distStrandStart}{distStrandStart !== distStrandEnd ? `-${distStrandEnd}` : ''}
                                        </TableCell>
                                        <TableCell className="text-center font-mono py-1 px-2 whitespace-nowrap">{distributionCable?.name}-{distributionCable?.fiberCount}</TableCell>
                                      </TableRow>
                                    );
                                    
                                    currentDistFiber += segmentFiberCount;
                                    currentFeedFiber += segmentFiberCount;
                                  }
                                  
                                  return ribbonRows;
                                } else {
                                  // Fiber view: show one row per fiber
                                  const fiberRows = [];
                                  
                                  if (!circuit.fiberStart || !circuit.fiberEnd || isNaN(circuit.fiberStart) || isNaN(circuit.fiberEnd)) {
                                    rowNumber++;
                                    return [(
                                      <TableRow key={circuit.id} className={rowBgColor} data-testid={`row-feed-spliced-circuit-${circuit.id}`}>
                                        <TableCell className="text-center font-mono py-1 px-2">{rowNumber}</TableCell>
                                        <TableCell colSpan={6} className="text-center text-muted-foreground">
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
                                    
                                    rowNumber++;
                                    fiberRows.push(
                                      <TableRow key={`${circuit.id}-feed-fiber-${i}`} className={rowBgColor} data-testid={`row-feed-fiber-${circuit.id}-${i}`}>
                                        <TableCell className="text-center font-mono py-1 px-2">{rowNumber}</TableCell>
                                        <TableCell className="text-center font-mono py-1 px-2 whitespace-nowrap">{feedCable.name}-{feedCable.fiberCount}</TableCell>
                                        <TableCell className={`text-center font-mono font-semibold py-1 px-2 whitespace-nowrap ${feedRibbonColor.colorClass}`}>R{feedRibbon}</TableCell>
                                        <TableCell className="text-center py-1 px-2">
                                          <div className={`inline-block px-1.5 py-0.5 rounded border border-black ${feedColor.bg} ${feedColor.text} font-mono font-semibold text-xs`}>
                                            {feedStrand}
                                          </div>
                                        </TableCell>
                                        <TableCell className="text-center font-mono font-semibold py-1 px-2 whitespace-nowrap">{circuitPrefix},{circuitNumber}</TableCell>
                                        <TableCell className="text-center py-1 px-2">
                                          <div className={`inline-block px-1.5 py-0.5 rounded border border-black ${distColor.bg} ${distColor.text} font-mono font-semibold text-xs`}>
                                            {distStrand}
                                          </div>
                                        </TableCell>
                                        <TableCell className={`text-center font-mono font-semibold py-1 px-2 whitespace-nowrap ${distRibbonColor.colorClass}`}>R{distRibbon}</TableCell>
                                        <TableCell className="text-center font-mono py-1 px-2 whitespace-nowrap">{distributionCable?.name}-{distributionCable?.fiberCount}</TableCell>
                                      </TableRow>
                                    );
                                  }
                                  
                                  return fiberRows;
                                }
                              });
                            })()}
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
          />
        </DialogContent>
      </Dialog>

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
