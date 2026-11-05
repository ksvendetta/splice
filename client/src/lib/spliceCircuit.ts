import type { Cable, Circuit } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";

export async function setCircuitSpliced({
  circuit,
  cable,
  checked,
  allCircuits,
  allCables,
  cableCircuits,
  mode,
}: {
  circuit: Circuit;
  cable: Cable;
  checked: boolean;
  allCircuits: Circuit[];
  allCables: Cable[];
  cableCircuits: Circuit[];
  mode: "fiber" | "copper";
}): Promise<void> {
  const refreshCircuits = async () => {
    await queryClient.refetchQueries({ queryKey: [`/api/${mode}/circuits/cable`, cable.id] });
    await queryClient.refetchQueries({ queryKey: [`/api/${mode}/circuits`] });
  };

  const loadCableCircuits = async (): Promise<Circuit[]> => {
    await refreshCircuits();
    const fromAll = queryClient.getQueryData<Circuit[]>([`/api/${mode}/circuits`]) ?? [];
    const listed = fromAll
      .filter(c => c.cableId === cable.id)
      .sort((a, b) => a.position - b.position);
    if (listed.length > 0) return listed;
    return queryClient.getQueryData<Circuit[]>([`/api/${mode}/circuits/cable`, cable.id]) ?? [];
  };

  const toggleSpliced = async (payload: {
    circuitId: string;
    feedCableId?: string;
    feedFiberStart?: number;
    feedFiberEnd?: number;
  }) => {
    try {
      await apiRequest("PATCH", `/api/${mode}/circuits/${payload.circuitId}/toggle-spliced`, {
        feedCableId: payload.feedCableId,
        feedFiberStart: payload.feedFiberStart,
        feedFiberEnd: payload.feedFiberEnd,
      });
      await refreshCircuits();
    } catch (error: any) {
      const message = error instanceof Error ? error.message : "An error occurred";
      if (message.includes("not found") || message.includes("404")) {
        await refreshCircuits();
        toast({ title: "Circuit not found - display refreshed", variant: "destructive" });
      } else {
        toast({
          title: "Failed to toggle splice status",
          description: message,
          variant: "destructive",
        });
      }
    }
  };


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

      // Sub-splice cables have a parentCableId pointing to their parent distribution cable
      const parentCableId = cable.parentCableId ?? undefined;

      console.log(`[SPLICE] Checking circuit: ${circuit.circuitId}, distStart: ${distStart}, distEnd: ${distEnd}, parentCableId: ${parentCableId}`);

      // Find ALL matching source circuits that this distribution range overlaps with.
      // For sub-splice cables: match against the parent distribution cable's circuits.
      // For regular distribution cables: match against Feed cable circuits.
      const matchingFeedCircuits = allCircuits.filter(c => {
        const cCable = allCables.find(cc => cc.id === c.cableId);
        if (parentCableId) {
          // Sub-splice: the sources are the parent cable (acting as f1) plus any
          // additional Feed cables the user added directly to this sub-splice.
          const isParentSource = c.cableId === parentCableId;
          const isSiblingFeedSource = cCable?.type === "Feed" && cCable?.parentCableId === parentCableId;
          if (!isParentSource && !isSiblingFeedSource) return false;
        } else {
          // Regular distribution: only look at Feed cable circuits
          if (cCable?.type !== "Feed") return false;
        }

        // Parse source circuit ID
        const feedParts = c.circuitId.split(',');
        if (feedParts.length !== 2) return false;

        const feedPrefix = feedParts[0].trim();

        // Check if prefixes match (case-insensitive: "LG52" matches "lg52")
        if (feedPrefix.toLowerCase() !== distributionPrefix.toLowerCase()) return false;

        // Parse source range
        const feedRangeParts = feedParts[1].trim().split('-');
        if (feedRangeParts.length !== 2) return false;

        const feedStart = parseInt(feedRangeParts[0]);
        const feedEnd = parseInt(feedRangeParts[1]);

        // Check if distribution range overlaps with this source range
        const overlaps = distStart <= feedEnd && distEnd >= feedStart;

        console.log(`[SPLICE] Checking source circuit: ${c.circuitId}, feedStart: ${feedStart}, feedEnd: ${feedEnd}, overlaps: ${overlaps}`);

        return overlaps;
      }).sort((a, b) => {
        // Sort by source range start to process in order
        const aStart = parseInt(a.circuitId.split(',')[1].trim().split('-')[0]);
        const bStart = parseInt(b.circuitId.split(',')[1].trim().split('-')[0]);
        return aStart - bStart;
      });

      const sourceLabel = parentCableId ? "parent cable" : "Feed";

      if (matchingFeedCircuits.length === 0) {
        toast({
          title: `No matching ${sourceLabel} circuit found`,
          description: `Could not find a ${sourceLabel} circuit with prefix "${distributionPrefix}" that contains the range ${distStart}-${distEnd}`,
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

          // Check all splits for overlapping splices before committing any
          for (const split of splits) {
            const splitFiberStart = split.feedCircuit.fiberStart + (split.start - parseInt(split.feedCircuit.circuitId.split(',')[1].trim().split('-')[0]));
            const splitFiberEnd = split.feedCircuit.fiberStart + (split.end - parseInt(split.feedCircuit.circuitId.split(',')[1].trim().split('-')[0]));
            const overlapping = allCircuits.find(c => {
              if (c.id === circuit.id) return false;
              if (c.isSpliced !== 1) return false;
              if (c.feedCableId !== split.feedCable?.id) return false;
              if (!c.feedFiberStart || !c.feedFiberEnd) return false;
              return splitFiberStart <= c.feedFiberEnd && splitFiberEnd >= c.feedFiberStart;
            });
            if (overlapping) {
              const overlapCable = allCables.find(cc => cc.id === overlapping.cableId);
              toast({
                title: "Splice overlap detected",
                description: `Feed fibers ${splitFiberStart}-${splitFiberEnd} are already spliced to "${overlapping.circuitId}" on ${overlapCable?.name ?? "another cable"}. Physical splice not possible.`,
                variant: "destructive",
              });
              return;
            }
          }

          // Mark first split as spliced
          await apiRequest("PATCH", `/api/${mode}/circuits/${circuit.id}/toggle-spliced`, {
            feedCableId: firstSplit.feedCable?.id,
            feedFiberStart: firstCalculatedFeedFiberStart,
            feedFiberEnd: firstCalculatedFeedFiberEnd
          });

          // Get current circuits to determine positioning
          const originalPosition = cableCircuits.findIndex((c: Circuit) => c.id === circuit.id);

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
                const updatedCircuits = await loadCableCircuits();
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
            description: `Created ${splits.length} circuit(s) spanning ${matchingFeedCircuits.length} ${sourceLabel} circuit(s)`,
          });
        } catch (error) {
          console.error('[SPLICE] Error splitting circuit:', error);
          toast({
            title: "Failed to split circuit",
            variant: "destructive",
          });
        }
      } else {
        // Single feed cable
        const matchingFeedCircuit = matchingFeedCircuits[0];
        const feedCable = allCables.find(c => c.id === matchingFeedCircuit.cableId);

        console.log(`[SPLICE] Matched feed circuit: ${matchingFeedCircuit.circuitId} on cable: ${feedCable?.name}`);

        // Parse Feed circuit range to calculate the specific fiber subset
        const feedParts = matchingFeedCircuit.circuitId.split(',');
        const feedRangeParts = feedParts[1].trim().split('-');
        const feedStart = parseInt(feedRangeParts[0]);
        const feedEnd = parseInt(feedRangeParts[1]);

        console.log(`[SPLICE] feedStart: ${feedStart}, feedEnd: ${feedEnd}`);

        // Does this single feed circuit cover the ENTIRE distribution range?
        const fullyCovered = distStart >= feedStart && distEnd <= feedEnd;

        if (fullyCovered) {
          // Common case - map the full distribution range onto the feed unchanged
          const offsetFromFeedStart = distStart - feedStart;
          const offsetFromFeedEnd = distEnd - feedStart;

          console.log(`[SPLICE] offsetFromFeedStart: ${offsetFromFeedStart}, offsetFromFeedEnd: ${offsetFromFeedEnd}`);

          // Calculate the actual Feed fiber positions for this subset
          const calculatedFeedFiberStart = matchingFeedCircuit.fiberStart + offsetFromFeedStart;
          const calculatedFeedFiberEnd = matchingFeedCircuit.fiberStart + offsetFromFeedEnd;

          console.log(`[SPLICE] calculatedFeedFiberStart: ${calculatedFeedFiberStart}, calculatedFeedFiberEnd: ${calculatedFeedFiberEnd}`);

          // Check for overlap: no other spliced circuit should already use these feed fibers
          const overlapping = allCircuits.find(c => {
            if (c.id === circuit.id) return false;
            if (c.isSpliced !== 1) return false;
            if (c.feedCableId !== feedCable?.id) return false;
            if (!c.feedFiberStart || !c.feedFiberEnd) return false;
            return calculatedFeedFiberStart <= c.feedFiberEnd && calculatedFeedFiberEnd >= c.feedFiberStart;
          });
          if (overlapping) {
            const overlapCable = allCables.find(cc => cc.id === overlapping.cableId);
            toast({
              title: "Splice overlap detected",
              description: `Feed fibers ${calculatedFeedFiberStart}-${calculatedFeedFiberEnd} are already spliced to "${overlapping.circuitId}" on ${overlapCable?.name ?? "another cable"}. Physical splice not possible.`,
              variant: "destructive",
            });
            return;
          }

          await toggleSpliced({
            circuitId: circuit.id,
            feedCableId: feedCable?.id,
            feedFiberStart: calculatedFeedFiberStart,
            feedFiberEnd: calculatedFeedFiberEnd,
          });
        } else {
          // Feed does NOT cover the whole distribution range -> SPLIT the circuit.
          // The intersection with the feed becomes the spliced portion; any remainder
          // beyond the feed becomes a new, separate, UNSPLICED circuit.
          const interStart = Math.max(distStart, feedStart);
          const interEnd = Math.min(distEnd, feedEnd);
          const calculatedFeedFiberStart = matchingFeedCircuit.fiberStart + (interStart - feedStart);
          const calculatedFeedFiberEnd = matchingFeedCircuit.fiberStart + (interEnd - feedStart);

          console.log(`[SPLICE] Partial coverage - splitting. intersection ${interStart}-${interEnd}, feed fibers ${calculatedFeedFiberStart}-${calculatedFeedFiberEnd}`);

          // Overlap pre-check for the spliced (intersection) portion. Abort without splitting.
          const overlapping = allCircuits.find(c => {
            if (c.id === circuit.id) return false;
            if (c.isSpliced !== 1) return false;
            if (c.feedCableId !== feedCable?.id) return false;
            if (!c.feedFiberStart || !c.feedFiberEnd) return false;
            return calculatedFeedFiberStart <= c.feedFiberEnd && calculatedFeedFiberEnd >= c.feedFiberStart;
          });
          if (overlapping) {
            const overlapCable = allCables.find(cc => cc.id === overlapping.cableId);
            toast({
              title: "Splice overlap detected",
              description: `Feed fibers ${calculatedFeedFiberStart}-${calculatedFeedFiberEnd} are already spliced to "${overlapping.circuitId}" on ${overlapCable?.name ?? "another cable"}. Physical splice not possible.`,
              variant: "destructive",
            });
            return;
          }

          try {
            const originalPosition = cableCircuits.findIndex((c: Circuit) => c.id === circuit.id);

            // 1) Shrink the original circuit to the intersection and splice it (clamped feed fibers)
            const interCircuitId = `${distributionPrefix},${interStart}-${interEnd}`;
            console.log(`[SPLICE] Updating original circuit to intersection: ${interCircuitId}`);
            await apiRequest("PATCH", `/api/${mode}/circuits/${circuit.id}/update-circuit-id`, {
              circuitId: interCircuitId,
            });
            await apiRequest("PATCH", `/api/${mode}/circuits/${circuit.id}/toggle-spliced`, {
              feedCableId: feedCable?.id,
              feedFiberStart: calculatedFeedFiberStart,
              feedFiberEnd: calculatedFeedFiberEnd,
            });

            // 2) Build the unspliced remainder ranges (leading first, then trailing)
            const remainders: [number, number][] = [];
            if (distStart < feedStart) remainders.push([distStart, feedStart - 1]);
            if (distEnd > feedEnd) remainders.push([feedEnd + 1, distEnd]);

            // 3) Create each remainder as a new UNSPLICED circuit, positioned right after the spliced portion
            for (let i = 0; i < remainders.length; i++) {
              const [rStart, rEnd] = remainders[i];
              const newCircuitId = `${distributionPrefix},${rStart}-${rEnd}`;

              console.log(`[SPLICE] Creating unspliced remainder circuit: ${newCircuitId}`);
              const response = await apiRequest("POST", `/api/${mode}/circuits`, {
                cableId: circuit.cableId,
                circuitId: newCircuitId,
              });
              const newCircuit = await response.json();

              if (newCircuit && newCircuit.id) {
                try {
                  const updatedCircuits = await loadCableCircuits();
                  const newCircuitPosition = updatedCircuits.findIndex((c: Circuit) => c.id === newCircuit.id);
                  const targetPosition = originalPosition + i + 1;
                  const movesNeeded = newCircuitPosition - targetPosition;
                  console.log(`[SPLICE] Moving remainder ${newCircuitId} from ${newCircuitPosition} to ${targetPosition}`);
                  for (let j = 0; j < movesNeeded; j++) {
                    await apiRequest("PATCH", `/api/${mode}/circuits/${newCircuit.id}/move`, {
                      direction: "up",
                    });
                  }
                } catch (moveError) {
                  console.error(`[SPLICE] Error moving remainder ${newCircuitId}:`, moveError);
                  // Movement is not critical - don't rethrow
                }
              }
            }

            // 4) Refresh the UI
            await queryClient.refetchQueries({ queryKey: [`/api/${mode}/circuits/cable`, cable.id] });
            await queryClient.refetchQueries({ queryKey: [`/api/${mode}/circuits`] });

            // 5) Informational notice describing the split (non-destructive/default variant)
            let noticeDescription = `The ${sourceLabel} only covers up to ${feedEnd}. Spliced ${distributionPrefix},${interStart}-${interEnd}`;
            for (const [rStart, rEnd] of remainders) {
              noticeDescription += `; created unspliced ${distributionPrefix},${rStart}-${rEnd} for the remainder`;
            }
            noticeDescription += `.`;
            toast({
              title: "Circuit split — not enough feed fibers",
              description: noticeDescription,
            });
          } catch (error) {
            console.error('[SPLICE] Error splitting circuit (single feed):', error);
            toast({
              title: "Failed to split circuit",
              variant: "destructive",
            });
          }
        }
      }
    } else {
      // Unchecking - just toggle without feed cable info
      await toggleSpliced({ circuitId: circuit.id });
    }
}

export async function spliceNewCableCircuits(
  cable: Cable,
  circuitIds: string[],
  mode: "fiber" | "copper",
): Promise<void> {
  if (cable.type !== "Distribution" || circuitIds.length === 0) return;
  const pending = circuitIds.map(id => id.trim().toLowerCase());
  const fetchFresh = <T,>(queryKey: unknown[]) =>
    queryClient.fetchQuery<T>({ queryKey, staleTime: 0 });

  for (const target of pending) {
    const allCircuits = await fetchFresh<Circuit[]>([`/api/${mode}/circuits`]);
    const allCables = await fetchFresh<Cable[]>([`/api/${mode}/cables`]);
    const cableCircuits = allCircuits
      .filter(c => c.cableId === cable.id)
      .sort((a, b) => a.position - b.position);
    const circuit = cableCircuits.find(
      c => c.isSpliced !== 1 && c.circuitId.trim().toLowerCase() === target,
    );
    if (!circuit) continue;
    await setCircuitSpliced({
      circuit,
      cable,
      checked: true,
      allCircuits,
      allCables,
      cableCircuits,
      mode,
    });
  }
}
