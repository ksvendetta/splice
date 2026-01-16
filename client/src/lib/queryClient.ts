import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { storage } from "./storage";
import type { Circuit } from "@shared/schema";

// Storage-based query function (replaces API fetch)
export const getQueryFn: <T>() => QueryFunction<T> =
  () =>
  async ({ queryKey }) => {
    const [endpoint, ...params] = queryKey as [string, ...any[]];
    
    // Map API endpoints to storage methods
    switch (endpoint) {
      case '/api/cables':
        return await storage.getAllCables() as any;
      case '/api/circuits':
        return await storage.getAllCircuits() as any;
      case '/api/circuits/cable':
        // Get circuits for a specific cable (params[0] is the cable ID)
        if (params.length > 0) {
          return await storage.getCircuitsByCableId(params[0]) as any;
        }
        throw new Error('Cable ID required for /api/circuits/cable');
      case '/api/saves':
        return await storage.getAllSaves() as any;
      default:
        // For specific resource queries like /api/cables/:id
        if (endpoint.startsWith('/api/cables/') && params.length === 0) {
          const id = endpoint.split('/').pop();
          return await storage.getCable(id!) as any;
        }
        if (endpoint.startsWith('/api/circuits/') && params.length === 0) {
          const id = endpoint.split('/').pop();
          return await storage.getCircuit(id!) as any;
        }
        if (endpoint.startsWith('/api/saves/') && params.length === 0) {
          const id = endpoint.split('/').pop();
          return await storage.getSave(id!) as any;
        }
        throw new Error(`Unknown query endpoint: ${endpoint}`);
    }
  };

// Storage-based API request (replaces fetch for mutations)
export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<{ json: () => Promise<any> }> {
  // Parse the URL and method to determine which storage operation to call
  const path = url.replace(/^\/api\//, '');
  const [resource, id, ...rest] = path.split('/');
  
  try {
    let result: any;
    
    if (method === 'POST') {
      if (resource === 'cables') {
        const cableData = data as any;
        result = await storage.createCable(cableData);
        
        // If circuitIds are provided, create the circuits
        if (cableData.circuitIds && Array.isArray(cableData.circuitIds) && cableData.circuitIds.length > 0) {
          let currentFiberStart = 1;
          
          for (const circuitId of cableData.circuitIds) {
            // Skip empty lines
            const trimmedCircuitId = circuitId.trim();
            if (!trimmedCircuitId) continue;
            
            // Parse circuit ID to get fiber count (format: "prefix,start-end")
            const parts = trimmedCircuitId.split(',');
            if (parts.length !== 2) continue; // Skip invalid format
            const rangeParts = parts[1].split('-');
            if (rangeParts.length !== 2) continue; // Skip invalid format
            const rangeStart = parseInt(rangeParts[0]);
            const rangeEnd = parseInt(rangeParts[1]);
            if (isNaN(rangeStart) || isNaN(rangeEnd)) continue; // Skip invalid numbers
            const fiberCount = rangeEnd - rangeStart + 1;
            
            const fiberEnd = currentFiberStart + fiberCount - 1;
            
            // Get current circuit count for position
            const existingCircuits = await storage.getCircuitsByCableId(result.id);
            const position = existingCircuits.length;
            
            // Create the circuit
            await storage.createCircuit({
              cableId: result.id,
              circuitId: trimmedCircuitId,
              position,
              fiberStart: currentFiberStart,
              fiberEnd
            });
            
            currentFiberStart = fiberEnd + 1;
          }
        }
      } else if (resource === 'circuits') {
        // Calculate circuit fiber positions before creating
        const circuitData = data as any;
        const cable = await storage.getCable(circuitData.cableId);
        if (!cable) throw new Error('Cable not found');
        
        // Parse circuit ID to get fiber count (format: "prefix,start-end")
        const parts = circuitData.circuitId.split(',');
        if (parts.length !== 2) throw new Error('Invalid circuit ID format');
        const rangeParts = parts[1].split('-');
        if (rangeParts.length !== 2) throw new Error('Invalid range format');
        const rangeStart = parseInt(rangeParts[0]);
        const rangeEnd = parseInt(rangeParts[1]);
        if (isNaN(rangeStart) || isNaN(rangeEnd)) throw new Error('Invalid range values');
        const fiberCount = rangeEnd - rangeStart + 1;
        
        // Get existing circuits to calculate position and fiber start
        const existingCircuits = await storage.getCircuitsByCableId(circuitData.cableId);
        const position = existingCircuits.length;
        
        let fiberStart = 1;
        if (existingCircuits.length > 0) {
          const lastCircuit = existingCircuits[existingCircuits.length - 1];
          fiberStart = lastCircuit.fiberEnd + 1;
        }
        
        const fiberEnd = fiberStart + fiberCount - 1;
        
        // Validate fiber range
        if (fiberEnd > cable.fiberCount) {
          throw new Error(`Circuit requires ${fiberCount} fibers but only ${cable.fiberCount - fiberStart + 1} fibers remaining`);
        }
        
        result = await storage.createCircuit({
          ...circuitData,
          position,
          fiberStart,
          fiberEnd
        });
      } else if (resource === 'saves') {
        if (rest.includes('load')) {
          // Load save
          await storage.loadSave(id);
          result = { success: true };
        } else {
          // Create new save
          const { name } = data as any;
          result = await storage.createSave(name);
        }
      }
    } else if (method === 'PATCH' || method === 'PUT') {
      if (resource === 'cables') {
        // Update cable
        await storage.updateCable(id, data as any);
        result = { success: true };
      } else if (resource === 'circuits' && rest.includes('toggle-spliced')) {
        // Toggle splice status
        const circuit = await storage.getCircuit(id);
        if (!circuit) throw new Error('Circuit not found');
        
        const newSplicedStatus = circuit.isSpliced === 1 ? 0 : 1;
        const updateData: any = { isSpliced: newSplicedStatus };
        
        if (newSplicedStatus === 1) {
          // Setting to spliced - include feed cable info
          const { feedCableId, feedFiberStart, feedFiberEnd } = data as any;
          updateData.feedCableId = feedCableId || null;
          updateData.feedFiberStart = feedFiberStart !== undefined ? feedFiberStart : null;
          updateData.feedFiberEnd = feedFiberEnd !== undefined ? feedFiberEnd : null;
        } else {
          // Setting to unspliced - clear feed cable info
          updateData.feedCableId = null;
          updateData.feedFiberStart = null;
          updateData.feedFiberEnd = null;
        }
        
        await storage.updateCircuit(id, updateData);
        result = { success: true };
      } else if (resource === 'circuits' && rest.includes('update-circuit-id')) {
        // Update circuit ID and recalculate all fiber positions
        const circuit = await storage.getCircuit(id);
        if (!circuit) throw new Error('Circuit not found');
        
        const { circuitId: newCircuitId } = data as any;
        
        // Parse new circuit ID to get fiber count
        const parts = newCircuitId.split(',');
        if (parts.length !== 2) throw new Error('Invalid circuit ID format');
        const rangeParts = parts[1].split('-');
        if (rangeParts.length !== 2) throw new Error('Invalid range format');
        const rangeStart = parseInt(rangeParts[0]);
        const rangeEnd = parseInt(rangeParts[1]);
        if (isNaN(rangeStart) || isNaN(rangeEnd)) throw new Error('Invalid range values');
        const newFiberCount = rangeEnd - rangeStart + 1;
        
        // Update the circuit ID
        await storage.updateCircuit(id, { circuitId: newCircuitId });
        
        // Recalculate fiber positions for all circuits in this cable using batch update
        const allCircuits = await storage.getCircuitsByCableId(circuit.cableId);
        let currentFiberStart = 1;
        
        const bulkUpdates: Array<{ id: string; changes: Partial<Circuit> }> = [];
        
        for (const c of allCircuits) {
          const updatedCircuit = c.id === id ? { ...c, circuitId: newCircuitId } : c;
          
          // Calculate fiber count from circuit ID
          const cParts = updatedCircuit.circuitId.split(',');
          const cRangeParts = cParts[1].split('-');
          const cStart = parseInt(cRangeParts[0]);
          const cEnd = parseInt(cRangeParts[1]);
          const cFiberCount = cEnd - cStart + 1;
          
          const fiberStart = currentFiberStart;
          const fiberEnd = fiberStart + cFiberCount - 1;
          
          bulkUpdates.push({ id: c.id, changes: { fiberStart, fiberEnd } });
          currentFiberStart = fiberEnd + 1;
        }
        
        await storage.bulkUpdateCircuits(bulkUpdates);
        
        // Update splice mappings in Distribution circuits that reference this Feed cable
        const cable = await storage.getCable(circuit.cableId);
        if (cable?.type === 'Feed') {
          const allDistCircuits = await storage.getAllCircuits();
          const updatedFeedCircuits = await storage.getCircuitsByCableId(circuit.cableId);
          const distBulkUpdates: Array<{ id: string; changes: Partial<Circuit> }> = [];
          
          for (const distCircuit of allDistCircuits) {
            if (distCircuit.isSpliced === 1 && distCircuit.feedCableId === circuit.cableId) {
              // Parse Distribution circuit ID to get the range
              const distParts = distCircuit.circuitId.split(',');
              if (distParts.length === 2) {
                const distPrefix = distParts[0].trim();
                const distRangeParts = distParts[1].trim().split('-');
                if (distRangeParts.length === 2) {
                  const distStart = parseInt(distRangeParts[0]);
                  const distEnd = parseInt(distRangeParts[1]);
                  
                  // Find matching Feed circuit
                  for (const feedCircuit of updatedFeedCircuits) {
                    const feedParts = feedCircuit.circuitId.split(',');
                    if (feedParts.length === 2) {
                      const feedPrefix = feedParts[0].trim();
                      if (feedPrefix === distPrefix) {
                        const feedRangeParts = feedParts[1].trim().split('-');
                        if (feedRangeParts.length === 2) {
                          const feedStart = parseInt(feedRangeParts[0]);
                          const feedEnd = parseInt(feedRangeParts[1]);
                          
                          // Check if Distribution range is within Feed range
                          if (distStart >= feedStart && distEnd <= feedEnd) {
                            // Recalculate the Feed fiber positions for this Distribution circuit
                            const offsetFromFeedStart = distStart - feedStart;
                            const offsetFromFeedEnd = distEnd - feedStart;
                            const newFeedFiberStart = feedCircuit.fiberStart + offsetFromFeedStart;
                            const newFeedFiberEnd = feedCircuit.fiberStart + offsetFromFeedEnd;
                            
                            distBulkUpdates.push({
                              id: distCircuit.id,
                              changes: { feedFiberStart: newFeedFiberStart, feedFiberEnd: newFeedFiberEnd }
                            });
                            break;
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
          
          if (distBulkUpdates.length > 0) {
            await storage.bulkUpdateCircuits(distBulkUpdates);
          }
        }
        
        result = { success: true };
      } else if (resource === 'circuits' && rest.includes('move')) {
        // Move circuit up or down and recalculate positions
        const { direction } = data as any;
        const circuit = await storage.getCircuit(id);
        if (!circuit) throw new Error('Circuit not found');
        
        const allCircuits = await storage.getCircuitsByCableId(circuit.cableId);
        const currentIndex = allCircuits.findIndex(c => c.id === id);
        
        if (currentIndex === -1) throw new Error('Circuit not found in cable');
        
        // Determine new index
        let newIndex = currentIndex;
        if (direction === 'up' && currentIndex > 0) {
          newIndex = currentIndex - 1;
        } else if (direction === 'down' && currentIndex < allCircuits.length - 1) {
          newIndex = currentIndex + 1;
        } else {
          throw new Error('Cannot move circuit in that direction');
        }
        
        // Swap positions
        const temp = allCircuits[currentIndex];
        allCircuits[currentIndex] = allCircuits[newIndex];
        allCircuits[newIndex] = temp;
        
        // Update position values and recalculate fiber positions using batch update
        let currentFiberStart = 1;
        const moveBulkUpdates: Array<{ id: string; changes: Partial<Circuit> }> = [];
        
        for (let i = 0; i < allCircuits.length; i++) {
          const c = allCircuits[i];
          
          // Calculate fiber count from circuit ID
          const parts = c.circuitId.split(',');
          const rangeParts = parts[1].split('-');
          const rangeStart = parseInt(rangeParts[0]);
          const rangeEnd = parseInt(rangeParts[1]);
          const fiberCount = rangeEnd - rangeStart + 1;
          
          const fiberStart = currentFiberStart;
          const fiberEnd = fiberStart + fiberCount - 1;
          
          moveBulkUpdates.push({ 
            id: c.id, 
            changes: { position: i, fiberStart, fiberEnd }
          });
          
          currentFiberStart = fiberEnd + 1;
        }
        
        await storage.bulkUpdateCircuits(moveBulkUpdates);
        
        // Update splice mappings in Distribution circuits that reference this Feed cable
        const cable = await storage.getCable(circuit.cableId);
        if (cable?.type === 'Feed') {
          const allDistCircuits = await storage.getAllCircuits();
          const updatedFeedCircuits = await storage.getCircuitsByCableId(circuit.cableId);
          const moveDistBulkUpdates: Array<{ id: string; changes: Partial<Circuit> }> = [];
          
          for (const distCircuit of allDistCircuits) {
            if (distCircuit.isSpliced === 1 && distCircuit.feedCableId === circuit.cableId) {
              // Parse Distribution circuit ID to get the range
              const distParts = distCircuit.circuitId.split(',');
              if (distParts.length === 2) {
                const distPrefix = distParts[0].trim();
                const distRangeParts = distParts[1].trim().split('-');
                if (distRangeParts.length === 2) {
                  const distStart = parseInt(distRangeParts[0]);
                  const distEnd = parseInt(distRangeParts[1]);
                  
                  // Find matching Feed circuit
                  for (const feedCircuit of updatedFeedCircuits) {
                    const feedParts = feedCircuit.circuitId.split(',');
                    if (feedParts.length === 2) {
                      const feedPrefix = feedParts[0].trim();
                      if (feedPrefix === distPrefix) {
                        const feedRangeParts = feedParts[1].trim().split('-');
                        if (feedRangeParts.length === 2) {
                          const feedStart = parseInt(feedRangeParts[0]);
                          const feedEnd = parseInt(feedRangeParts[1]);
                          
                          // Check if Distribution range is within Feed range
                          if (distStart >= feedStart && distEnd <= feedEnd) {
                            // Recalculate the Feed fiber positions for this Distribution circuit
                            const offsetFromFeedStart = distStart - feedStart;
                            const offsetFromFeedEnd = distEnd - feedStart;
                            const newFeedFiberStart = feedCircuit.fiberStart + offsetFromFeedStart;
                            const newFeedFiberEnd = feedCircuit.fiberStart + offsetFromFeedEnd;
                            
                            moveDistBulkUpdates.push({
                              id: distCircuit.id,
                              changes: { feedFiberStart: newFeedFiberStart, feedFiberEnd: newFeedFiberEnd }
                            });
                            break;
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
          
          if (moveDistBulkUpdates.length > 0) {
            await storage.bulkUpdateCircuits(moveDistBulkUpdates);
          }
        }
        
        result = { success: true };
      } else if (resource === 'circuits') {
        await storage.updateCircuit(id, data as any);
        result = { success: true };
      }
    } else if (method === 'DELETE') {
      if (resource === 'reset') {
        // Reset all data in IndexedDB
        await storage.resetAllData();
        result = { success: true };
      } else if (resource === 'cables') {
        await storage.deleteCable(id);
        result = { success: true };
      } else if (resource === 'circuits') {
        await storage.deleteCircuit(id);
        result = { success: true };
      } else if (resource === 'saves') {
        if (id === 'load') {
          const { id: saveId } = data as any;
          await storage.loadSave(saveId);
          result = { success: true };
        } else {
          await storage.deleteSave(id);
          result = { success: true };
        }
      }
    }
    
    return {
      json: async () => result
    };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Storage operation failed');
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn(),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
