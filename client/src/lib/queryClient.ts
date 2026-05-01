import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { storage } from "./storage";
import { createUndoSnapshot, pushUndoSnapshot } from "./undoManager";
import type { Circuit } from "@shared/schema";

// Extract mode from endpoint (e.g., /api/fiber/cables -> 'fiber', /api/copper/cables -> 'copper')
export function getModeFromEndpoint(endpoint: string): 'fiber' | 'copper' {
  if (endpoint.includes('/fiber/')) {
    return 'fiber';
  }
  if (endpoint.includes('/copper/')) {
    return 'copper';
  }
  // Default to fiber for legacy endpoints without mode
  return 'fiber';
}

// Storage-based query function (replaces API fetch)
export const getQueryFn: <T>() => QueryFunction<T> =
  () =>
  async ({ queryKey }) => {
    const [endpoint, ...params] = queryKey as [string, ...any[]];
    const mode = getModeFromEndpoint(endpoint);

    // Map API endpoints to storage methods
    // Handle both legacy (/api/cables) and mode-specific (/api/fiber/cables, /api/copper/cables) endpoints
    if (endpoint === '/api/cables' || endpoint.match(/\/api\/(fiber|copper)\/cables$/)) {
      return await storage.getAllCables(mode) as any;
    }
    if (endpoint === '/api/circuits' || endpoint.match(/\/api\/(fiber|copper)\/circuits$/)) {
      return await storage.getAllCircuits(mode) as any;
    }
    if (endpoint === '/api/circuits/cable' || endpoint.match(/\/api\/(fiber|copper)\/circuits\/cable$/)) {
      // Get circuits for a specific cable (params[0] is the cable ID)
      if (params.length > 0) {
        return await storage.getCircuitsByCableId(params[0], mode) as any;
      }
      throw new Error('Cable ID required for circuits/cable endpoint');
    }
    if (endpoint === '/api/saves' || endpoint.match(/\/api\/(fiber|copper)\/saves$/)) {
      return await storage.getAllSaves(mode) as any;
    }

    // For specific resource queries like /api/cables/:id or /api/fiber/cables/:id
    if (endpoint.match(/\/api\/(fiber\/|copper\/)?cables\/[^/]+$/) && params.length === 0) {
      const id = endpoint.split('/').pop();
      return await storage.getCable(id!, mode) as any;
    }
    if (endpoint.match(/\/api\/(fiber\/|copper\/)?circuits\/[^/]+$/) && params.length === 0) {
      const id = endpoint.split('/').pop();
      return await storage.getCircuit(id!, mode) as any;
    }
    if (endpoint.match(/\/api\/(fiber\/|copper\/)?saves\/[^/]+$/) && params.length === 0) {
      const id = endpoint.split('/').pop();
      return await storage.getSave(id!, mode) as any;
    }

    throw new Error(`Unknown query endpoint: ${endpoint}`);
  };

// Storage-based API request (replaces fetch for mutations)
export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<{ json: () => Promise<any> }> {
  // Extract mode from URL
  const mode = getModeFromEndpoint(url);

  // Parse the URL and method to determine which storage operation to call
  // Remove /api/ and optional mode prefix (fiber/ or copper/)
  const path = url.replace(/^\/api\//, '').replace(/^(fiber|copper)\//, '');
  const [resource, id, ...rest] = path.split('/');
  const isProjectSaveLoad = resource === 'saves' && (rest.includes('load') || id === 'load');
  const shouldTrackUndo = (resource !== 'saves' || isProjectSaveLoad) && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);
  const undoEntry = shouldTrackUndo
    ? await createUndoSnapshot(mode, getUndoLabel(method, resource, rest))
    : null;

  try {
    let result: any;
    
    if (method === 'POST') {
      if (resource === 'cables') {
        const cableData = data as any;
        result = await storage.createCable(cableData, mode);

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
            const existingCircuits = await storage.getCircuitsByCableId(result.id, mode);
            const position = existingCircuits.length;

            // Create the circuit
            await storage.createCircuit({
              cableId: result.id,
              circuitId: trimmedCircuitId,
              position,
              fiberStart: currentFiberStart,
              fiberEnd
            }, mode);

            currentFiberStart = fiberEnd + 1;
          }
        }
      } else if (resource === 'circuits') {
        // Calculate circuit fiber positions before creating
        const circuitData = data as any;
        const cable = await storage.getCable(circuitData.cableId, mode);
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
        const existingCircuits = await storage.getCircuitsByCableId(circuitData.cableId, mode);
        const insertAt = typeof circuitData.insertAt === 'number'
          ? Math.max(0, Math.min(existingCircuits.length, circuitData.insertAt))
          : existingCircuits.length;

        const orderedCircuits = [...existingCircuits];
        orderedCircuits.splice(insertAt, 0, {
          ...circuitData,
          id: "__new__",
          position: insertAt,
          fiberStart: 0,
          fiberEnd: 0,
          isSpliced: 0,
          feedCableId: null,
          feedFiberStart: null,
          feedFiberEnd: null,
        } as Circuit);

        let currentFiberStart = 1;
        let newFiberStart = 1;
        let newFiberEnd = fiberCount;
        const repositionUpdates: Array<{ id: string; changes: Partial<Circuit> }> = [];

        for (let i = 0; i < orderedCircuits.length; i++) {
          const orderedCircuit = orderedCircuits[i];
          const orderedParts = orderedCircuit.circuitId.split(',');
          if (orderedParts.length !== 2) throw new Error('Invalid circuit ID format');
          const orderedRangeParts = orderedParts[1].split('-');
          if (orderedRangeParts.length !== 2) throw new Error('Invalid range format');
          const orderedRangeStart = parseInt(orderedRangeParts[0]);
          const orderedRangeEnd = parseInt(orderedRangeParts[1]);
          if (isNaN(orderedRangeStart) || isNaN(orderedRangeEnd)) throw new Error('Invalid range values');

          const orderedFiberCount = orderedRangeEnd - orderedRangeStart + 1;
          const fiberStart = currentFiberStart;
          const fiberEnd = fiberStart + orderedFiberCount - 1;

          if (orderedCircuit.id === "__new__") {
            newFiberStart = fiberStart;
            newFiberEnd = fiberEnd;
          } else {
            repositionUpdates.push({
              id: orderedCircuit.id,
              changes: { position: i, fiberStart, fiberEnd }
            });
          }

          currentFiberStart = fiberEnd + 1;
        }

        const { insertAt: _insertAt, ...createCircuitData } = circuitData;
        result = await storage.createCircuit({
          ...createCircuitData,
          position: insertAt,
          fiberStart: newFiberStart,
          fiberEnd: newFiberEnd
        }, mode);

        if (repositionUpdates.length > 0) {
          await storage.bulkUpdateCircuits(repositionUpdates, mode);
        }

        if (cable.type === 'Feed') {
          const allDistCircuits = await storage.getAllCircuits(mode);
          const updatedFeedCircuits = await storage.getCircuitsByCableId(circuitData.cableId, mode);
          const distBulkUpdates: Array<{ id: string; changes: Partial<Circuit> }> = [];

          for (const distCircuit of allDistCircuits) {
            if (distCircuit.isSpliced === 1 && distCircuit.feedCableId === circuitData.cableId) {
              const distParts = distCircuit.circuitId.split(',');
              if (distParts.length !== 2) continue;
              const distPrefix = distParts[0].trim();
              const distRangeParts = distParts[1].trim().split('-');
              if (distRangeParts.length !== 2) continue;

              const distStart = parseInt(distRangeParts[0]);
              const distEnd = parseInt(distRangeParts[1]);
              if (isNaN(distStart) || isNaN(distEnd)) continue;

              for (const feedCircuit of updatedFeedCircuits) {
                const feedParts = feedCircuit.circuitId.split(',');
                if (feedParts.length !== 2) continue;
                const feedPrefix = feedParts[0].trim();
                if (feedPrefix !== distPrefix) continue;

                const feedRangeParts = feedParts[1].trim().split('-');
                if (feedRangeParts.length !== 2) continue;
                const feedStart = parseInt(feedRangeParts[0]);
                const feedEnd = parseInt(feedRangeParts[1]);
                if (isNaN(feedStart) || isNaN(feedEnd)) continue;

                if (distStart >= feedStart && distEnd <= feedEnd) {
                  const offsetFromFeedStart = distStart - feedStart;
                  const offsetFromFeedEnd = distEnd - feedStart;
                  distBulkUpdates.push({
                    id: distCircuit.id,
                    changes: {
                      feedFiberStart: feedCircuit.fiberStart + offsetFromFeedStart,
                      feedFiberEnd: feedCircuit.fiberStart + offsetFromFeedEnd,
                    }
                  });
                  break;
                }
              }
            }
          }

          if (distBulkUpdates.length > 0) {
            await storage.bulkUpdateCircuits(distBulkUpdates, mode);
          }
        }
      } else if (resource === 'saves') {
        if (rest.includes('load')) {
          // Load save
          await storage.loadSave(id, mode);
          result = { success: true };
        } else {
          // Create new save
          const { name } = data as any;
          result = await storage.createSave(name, mode);
        }
      }
    } else if (method === 'PATCH' || method === 'PUT') {
      if (resource === 'cables') {
        // Update cable
        await storage.updateCable(id, data as any, mode);
        result = { success: true };
      } else if (resource === 'circuits' && rest.includes('toggle-spliced')) {
        // Toggle splice status
        const circuit = await storage.getCircuit(id, mode);
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

        await storage.updateCircuit(id, updateData, mode);
        result = { success: true };
      } else if (resource === 'circuits' && rest.includes('update-circuit-id')) {
        // Update circuit ID and recalculate all fiber positions
        const circuit = await storage.getCircuit(id, mode);
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
        await storage.updateCircuit(id, { circuitId: newCircuitId }, mode);

        // Recalculate fiber positions for all circuits in this cable using batch update
        const allCircuits = await storage.getCircuitsByCableId(circuit.cableId, mode);
        let currentFiberStart = 1;

        const bulkUpdates: Array<{ id: string; changes: Partial<Circuit> }> = [];

        for (const c of allCircuits) {
          const updatedCircuit = c.id === id ? { ...c, circuitId: newCircuitId } : c;

          // Skip circuits with empty or invalid circuit IDs
          if (!updatedCircuit.circuitId || !updatedCircuit.circuitId.includes(',')) {
            continue;
          }

          // Calculate fiber count from circuit ID
          const cParts = updatedCircuit.circuitId.split(',');
          if (!cParts[1]) continue;

          const cRangeParts = cParts[1].split('-');
          if (cRangeParts.length !== 2) continue;

          const cStart = parseInt(cRangeParts[0]);
          const cEnd = parseInt(cRangeParts[1]);
          if (isNaN(cStart) || isNaN(cEnd)) continue;

          const cFiberCount = cEnd - cStart + 1;

          const fiberStart = currentFiberStart;
          const fiberEnd = fiberStart + cFiberCount - 1;

          bulkUpdates.push({ id: c.id, changes: { fiberStart, fiberEnd } });
          currentFiberStart = fiberEnd + 1;
        }

        await storage.bulkUpdateCircuits(bulkUpdates, mode);

        // Update splice mappings in Distribution circuits that reference this Feed cable
        const cable = await storage.getCable(circuit.cableId, mode);
        if (cable?.type === 'Feed') {
          const allDistCircuits = await storage.getAllCircuits(mode);
          const updatedFeedCircuits = await storage.getCircuitsByCableId(circuit.cableId, mode);
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
            await storage.bulkUpdateCircuits(distBulkUpdates, mode);
          }
        }

        result = { success: true };
      } else if (resource === 'circuits' && rest.includes('move')) {
        // Move circuit up or down and recalculate positions
        const { direction } = data as any;
        const circuit = await storage.getCircuit(id, mode);
        if (!circuit) throw new Error('Circuit not found');

        const allCircuits = await storage.getCircuitsByCableId(circuit.cableId, mode);
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

          // Skip circuits with empty or invalid circuit IDs
          if (!c.circuitId || !c.circuitId.includes(',')) {
            continue;
          }

          // Calculate fiber count from circuit ID
          const parts = c.circuitId.split(',');
          if (!parts[1]) continue;

          const rangeParts = parts[1].split('-');
          if (rangeParts.length !== 2) continue;

          const rangeStart = parseInt(rangeParts[0]);
          const rangeEnd = parseInt(rangeParts[1]);
          if (isNaN(rangeStart) || isNaN(rangeEnd)) continue;

          const fiberCount = rangeEnd - rangeStart + 1;

          const fiberStart = currentFiberStart;
          const fiberEnd = fiberStart + fiberCount - 1;

          moveBulkUpdates.push({
            id: c.id,
            changes: { position: i, fiberStart, fiberEnd }
          });

          currentFiberStart = fiberEnd + 1;
        }

        await storage.bulkUpdateCircuits(moveBulkUpdates, mode);

        // Update splice mappings in Distribution circuits that reference this Feed cable
        const cable = await storage.getCable(circuit.cableId, mode);
        if (cable?.type === 'Feed') {
          const allDistCircuits = await storage.getAllCircuits(mode);
          const updatedFeedCircuits = await storage.getCircuitsByCableId(circuit.cableId, mode);
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
            await storage.bulkUpdateCircuits(moveDistBulkUpdates, mode);
          }
        }

        result = { success: true };
      } else if (resource === 'circuits') {
        await storage.updateCircuit(id, data as any, mode);
        result = { success: true };
      }
    } else if (method === 'DELETE') {
      if (resource === 'reset') {
        // Reset all data in IndexedDB
        await storage.resetAllData(mode);
        result = { success: true };
      } else if (resource === 'cables') {
        await storage.deleteCable(id, mode);
        result = { success: true };
      } else if (resource === 'circuits') {
        await storage.deleteCircuit(id, mode);
        result = { success: true };
      } else if (resource === 'saves') {
        if (id === 'load') {
          const { id: saveId } = data as any;
          await storage.loadSave(saveId, mode);
          result = { success: true };
        } else {
          await storage.deleteSave(id, mode);
          result = { success: true };
        }
      }
    }
    
    if (undoEntry) {
      pushUndoSnapshot(mode, undoEntry);
    }

    return {
      json: async () => result
    };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Storage operation failed');
  }
}

function getUndoLabel(method: string, resource: string, rest: string[]) {
  if (resource === 'reset') return 'Reset data';
  if (resource === 'cables') {
    if (method === 'POST') return 'Add cable';
    if (method === 'DELETE') return 'Delete cable';
    return 'Update cable';
  }
  if (resource === 'circuits') {
    if (method === 'POST') return 'Add circuit';
    if (method === 'DELETE') return 'Delete circuit';
    if (rest.includes('toggle-spliced')) return 'Update splice';
    if (rest.includes('update-circuit-id')) return 'Update circuit ID';
    if (rest.includes('move')) return 'Move circuit';
    return 'Update circuit';
  }
  return 'Change';
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
