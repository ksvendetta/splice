import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertCableSchema, insertCircuitSchema, insertSpliceSchema, insertSettingsSchema, parseCircuitId, circuitIdsOverlap, type Circuit } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/cables", async (_req, res) => {
    try {
      const cables = await storage.getAllCables();
      res.json(cables);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch cables" });
    }
  });

  app.get("/api/cables/:id", async (req, res) => {
    try {
      const cable = await storage.getCable(req.params.id);
      if (!cable) {
        return res.status(404).json({ error: "Cable not found" });
      }
      res.json(cable);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch cable" });
    }
  });

  app.post("/api/cables", async (req, res) => {
    try {
      const validatedData = insertCableSchema.parse(req.body);
      
      // Get settings to determine ribbon/binder size
      const settings = await storage.getSettings();
      const ribbonSize = settings.spliceMode === "copper" ? 25 : 12;
      
      // Check for duplicate cable name
      const existingCables = await storage.getAllCables();
      const duplicateName = existingCables.find(c => c.name.toLowerCase() === validatedData.name.toLowerCase());
      if (duplicateName) {
        return res.status(400).json({ error: `Cable name "${validatedData.name}" already exists. Please choose a different name.` });
      }
      
      // Validate circuits BEFORE creating cable
      if (validatedData.circuitIds && validatedData.circuitIds.length > 0) {
        // Filter out empty lines
        const filteredCircuitIds = validatedData.circuitIds
          .map(id => id.trim())
          .filter(id => id.length > 0);
        
        let currentFiberStart = 1;
        
        for (let i = 0; i < filteredCircuitIds.length; i++) {
          const circuitId = filteredCircuitIds[i];
          
          // Parse circuit ID to get fiber count
          let fiberCount: number;
          try {
            fiberCount = parseCircuitId(circuitId);
          } catch (error) {
            // Skip invalid circuit IDs
            continue;
          }
          
          const fiberEnd = currentFiberStart + fiberCount - 1;
          
          // Validate fiber range doesn't exceed cable capacity
          if (fiberEnd > validatedData.fiberCount) {
            return res.status(400).json({ 
              error: `Circuit "${circuitId}" requires ${fiberCount} fibers but only ${validatedData.fiberCount - currentFiberStart + 1} fibers remaining in cable` 
            });
          }
          
          currentFiberStart = fiberEnd + 1;
        }
      }
      
      // All validations passed, now create the cable
      const cable = await storage.createCable(validatedData, ribbonSize);
      
      // Create circuits if provided
      if (validatedData.circuitIds && validatedData.circuitIds.length > 0) {
        // Filter out empty lines
        const filteredCircuitIds = validatedData.circuitIds
          .map(id => id.trim())
          .filter(id => id.length > 0);
        
        let currentFiberStart = 1;
        
        for (let i = 0; i < filteredCircuitIds.length; i++) {
          const circuitId = filteredCircuitIds[i];
          
          // Parse circuit ID to get fiber count
          let fiberCount: number;
          try {
            fiberCount = parseCircuitId(circuitId);
          } catch (error) {
            // Skip invalid circuit IDs
            continue;
          }
          
          const fiberEnd = currentFiberStart + fiberCount - 1;
          
          // Create circuit
          await storage.createCircuit({
            cableId: cable.id,
            circuitId: circuitId,
            position: i,
            fiberStart: currentFiberStart,
            fiberEnd: fiberEnd,
          });
          
          currentFiberStart = fiberEnd + 1;
        }
      }
      
      res.status(201).json(cable);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid cable data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create cable" });
    }
  });

  app.put("/api/cables/:id", async (req, res) => {
    try {
      const validatedData = insertCableSchema.parse(req.body);
      
      // Check for duplicate cable name (excluding current cable)
      const existingCables = await storage.getAllCables();
      const duplicateName = existingCables.find(c => 
        c.id !== req.params.id && c.name.toLowerCase() === validatedData.name.toLowerCase()
      );
      if (duplicateName) {
        return res.status(400).json({ error: `Cable name "${validatedData.name}" already exists. Please choose a different name.` });
      }
      
      const cable = await storage.updateCable(req.params.id, validatedData);
      if (!cable) {
        return res.status(404).json({ error: "Cable not found" });
      }
      res.json(cable);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid cable data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update cable" });
    }
  });

  app.delete("/api/cables/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteCable(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Cable not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete cable" });
    }
  });

  app.get("/api/circuits", async (_req, res) => {
    try {
      const circuits = await storage.getAllCircuits();
      res.json(circuits);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch circuits" });
    }
  });

  app.get("/api/circuits/cable/:cableId", async (req, res) => {
    try {
      const circuits = await storage.getCircuitsByCableId(req.params.cableId);
      res.json(circuits);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch circuits" });
    }
  });

  app.get("/api/circuits/:id", async (req, res) => {
    try {
      const circuit = await storage.getCircuit(req.params.id);
      if (!circuit) {
        return res.status(404).json({ error: "Circuit not found" });
      }
      res.json(circuit);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch circuit" });
    }
  });

  app.post("/api/circuits", async (req, res) => {
    try {
      const validatedData = insertCircuitSchema.parse(req.body);
      
      const cable = await storage.getCable(validatedData.cableId);
      if (!cable) {
        return res.status(400).json({ error: "Cable not found" });
      }
      
      // Parse circuit ID to get fiber count
      let fiberCount: number;
      try {
        fiberCount = parseCircuitId(validatedData.circuitId);
      } catch (error) {
        return res.status(400).json({ 
          error: `Invalid circuit ID format. Expected format: "prefix,start-end" (e.g., "lg,33-36")` 
        });
      }
      
      // Get existing circuits for this cable to calculate position
      const existingCircuits = await storage.getCircuitsByCableId(validatedData.cableId);
      const position = existingCircuits.length; // 0-indexed position
      
      // Calculate fiber start based on previous circuits
      let fiberStart = 1;
      if (existingCircuits.length > 0) {
        const lastCircuit = existingCircuits[existingCircuits.length - 1];
        fiberStart = lastCircuit.fiberEnd + 1;
      }
      
      const fiberEnd = fiberStart + fiberCount - 1;
      
      // Validate fiber range
      if (fiberEnd > cable.fiberCount) {
        return res.status(400).json({ 
          error: `Circuit requires ${fiberCount} fibers but only ${cable.fiberCount - fiberStart + 1} fibers remaining in cable` 
        });
      }
      
      // Create circuit with auto-calculated values
      const circuitData = {
        ...validatedData,
        position,
        fiberStart,
        fiberEnd,
      };
      
      const circuit = await storage.createCircuit(circuitData);
      res.status(201).json(circuit);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid circuit data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create circuit" });
    }
  });

  app.put("/api/circuits/:id", async (req, res) => {
    try {
      const partialData = insertCircuitSchema.partial().parse(req.body);
      const circuit = await storage.updateCircuit(req.params.id, partialData);
      if (!circuit) {
        return res.status(404).json({ error: "Circuit not found" });
      }
      res.json(circuit);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid circuit data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update circuit" });
    }
  });

  app.patch("/api/circuits/:id/toggle-spliced", async (req, res) => {
    try {
      const { feedCableId, feedFiberStart, feedFiberEnd } = req.body;
      
      // Get the circuit being updated
      const circuit = await storage.getCircuit(req.params.id);
      if (!circuit) {
        return res.status(404).json({ error: "Circuit not found" });
      }
      
      // If enabling splice (feedCableId provided), check for conflicts with other spliced circuits
      if (feedCableId && feedFiberStart !== undefined && feedFiberEnd !== undefined) {
        // Get all circuits across all cables
        const allCircuits = await storage.getAllCircuits();
        
        // Check if any other spliced circuit is using the same feed cable with overlapping fibers
        for (const otherCircuit of allCircuits) {
          // Skip the current circuit being updated
          if (otherCircuit.id === req.params.id) {
            continue;
          }
          
          // Skip circuits that are not spliced or don't have feed cable info
          if (otherCircuit.isSpliced !== 1 || !otherCircuit.feedCableId || 
              otherCircuit.feedFiberStart === null || otherCircuit.feedFiberEnd === null) {
            continue;
          }
          
          // Check if using the same feed cable
          if (otherCircuit.feedCableId === feedCableId) {
            // Check if fiber ranges overlap
            const rangesOverlap = feedFiberStart <= otherCircuit.feedFiberEnd && 
                                  otherCircuit.feedFiberStart <= feedFiberEnd;
            
            if (rangesOverlap) {
              // Get cable names for better error message
              const feedCable = await storage.getCable(feedCableId);
              const distCable = await storage.getCable(otherCircuit.cableId);
              
              return res.status(400).json({ 
                error: `Cannot splice: Feed cable "${feedCable?.name}" fibers ${feedFiberStart}-${feedFiberEnd} are already used by circuit "${otherCircuit.circuitId}" on cable "${distCable?.name}"` 
              });
            }
          }
        }
      }
      
      const updatedCircuit = await storage.toggleCircuitSpliced(req.params.id, feedCableId, feedFiberStart, feedFiberEnd);
      if (!updatedCircuit) {
        return res.status(404).json({ error: "Circuit not found" });
      }
      res.json(updatedCircuit);
    } catch (error) {
      res.status(500).json({ error: "Failed to toggle circuit spliced status" });
    }
  });

  app.patch("/api/circuits/:id/update-circuit-id", async (req, res) => {
    try {
      const circuit = await storage.getCircuit(req.params.id);
      if (!circuit) {
        return res.status(404).json({ error: "Circuit not found" });
      }
      
      const { circuitId } = req.body;
      if (!circuitId) {
        return res.status(400).json({ error: "Circuit ID is required" });
      }
      
      // Validate and parse new circuit ID to get fiber count
      let newFiberCount: number;
      try {
        newFiberCount = parseCircuitId(circuitId);
      } catch (error) {
        return res.status(400).json({ 
          error: `Invalid circuit ID format. Expected format: "prefix,start-end" (e.g., "lg,33-36")` 
        });
      }
      
      // Clear splice data when circuit ID changes (fiber count may have changed)
      await storage.updateCircuit(req.params.id, { 
        circuitId,
        isSpliced: 0,
        feedCableId: null,
        feedFiberStart: null,
        feedFiberEnd: null
      } as Partial<Circuit>);
      
      // Get all circuits for this cable to recalculate fiber ranges
      const allCircuits = await storage.getCircuitsByCableId(circuit.cableId);
      const cable = await storage.getCable(circuit.cableId);
      if (!cable) {
        return res.status(404).json({ error: "Cable not found" });
      }
      
      // Recalculate fiber ranges for all circuits
      let currentFiberStart = 1;
      for (let i = 0; i < allCircuits.length; i++) {
        const circ = allCircuits[i];
        const fiberCount = parseCircuitId(circ.circuitId);
        const fiberEnd = currentFiberStart + fiberCount - 1;
        
        // Check if exceeds cable capacity
        if (fiberEnd > cable.fiberCount) {
          return res.status(400).json({ 
            error: `Circuit requires ${fiberCount} fibers but only ${cable.fiberCount - currentFiberStart + 1} fibers remaining in cable` 
          });
        }
        
        await storage.updateCircuit(circ.id, {
          fiberStart: currentFiberStart,
          fiberEnd: fiberEnd,
        } as Partial<Circuit>);
        
        currentFiberStart = fiberEnd + 1;
      }
      
      const updatedCircuit = await storage.getCircuit(req.params.id);
      res.json(updatedCircuit);
    } catch (error) {
      res.status(500).json({ error: "Failed to update circuit ID" });
    }
  });

  app.patch("/api/circuits/:id/move", async (req, res) => {
    try {
      const circuit = await storage.getCircuit(req.params.id);
      if (!circuit) {
        return res.status(404).json({ error: "Circuit not found" });
      }
      
      const { direction } = req.body;
      if (direction !== "up" && direction !== "down") {
        return res.status(400).json({ error: "Direction must be 'up' or 'down'" });
      }
      
      // Get all circuits for this cable
      const allCircuits = await storage.getCircuitsByCableId(circuit.cableId);
      const currentIndex = allCircuits.findIndex(c => c.id === circuit.id);
      
      if (currentIndex === -1) {
        return res.status(404).json({ error: "Circuit not found in cable" });
      }
      
      // Check if move is valid
      if (direction === "up" && currentIndex === 0) {
        return res.status(400).json({ error: "Cannot move first circuit up" });
      }
      if (direction === "down" && currentIndex === allCircuits.length - 1) {
        return res.status(400).json({ error: "Cannot move last circuit down" });
      }
      
      // Swap positions
      const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      const swapCircuit = allCircuits[swapIndex];
      
      await storage.updateCircuit(circuit.id, { position: swapIndex } as Partial<Circuit>);
      await storage.updateCircuit(swapCircuit.id, { position: currentIndex } as Partial<Circuit>);
      
      // Get updated circuits and recalculate fiber ranges
      const updatedCircuits = await storage.getCircuitsByCableId(circuit.cableId);
      const cable = await storage.getCable(circuit.cableId);
      if (!cable) {
        return res.status(404).json({ error: "Cable not found" });
      }
      
      // Recalculate fiber ranges for all circuits
      let currentFiberStart = 1;
      for (let i = 0; i < updatedCircuits.length; i++) {
        const circ = updatedCircuits[i];
        const fiberCount = parseCircuitId(circ.circuitId);
        const fiberEnd = currentFiberStart + fiberCount - 1;
        
        await storage.updateCircuit(circ.id, {
          fiberStart: currentFiberStart,
          fiberEnd: fiberEnd,
        } as Partial<Circuit>);
        
        currentFiberStart = fiberEnd + 1;
      }
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to move circuit" });
    }
  });

  app.delete("/api/circuits/:id", async (req, res) => {
    try {
      // Get the circuit being deleted to know its cable
      const circuit = await storage.getCircuit(req.params.id);
      if (!circuit) {
        return res.status(404).json({ error: "Circuit not found" });
      }
      
      // Delete the circuit
      await storage.deleteCircuit(req.params.id);
      
      // Get all remaining circuits for this cable, ordered by position
      const remainingCircuits = await storage.getCircuitsByCableId(circuit.cableId);
      
      // Recalculate positions and fiber ranges for all circuits
      let currentFiberStart = 1;
      for (let i = 0; i < remainingCircuits.length; i++) {
        const circ = remainingCircuits[i];
        const fiberCount = parseCircuitId(circ.circuitId);
        const fiberEnd = currentFiberStart + fiberCount - 1;
        
        await storage.updateCircuit(circ.id, {
          position: i,
          fiberStart: currentFiberStart,
          fiberEnd: fiberEnd,
        } as Partial<Circuit>);
        
        currentFiberStart = fiberEnd + 1;
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete circuit" });
    }
  });

  app.get("/api/splices", async (_req, res) => {
    try {
      const splices = await storage.getAllSplices();
      res.json(splices);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch splices" });
    }
  });

  app.get("/api/splices/:id", async (req, res) => {
    try {
      const splice = await storage.getSplice(req.params.id);
      if (!splice) {
        return res.status(404).json({ error: "Splice not found" });
      }
      res.json(splice);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch splice" });
    }
  });

  app.post("/api/splices", async (req, res) => {
    try {
      const sourceCable = await storage.getCable(req.body.sourceCableId);
      const destCable = await storage.getCable(req.body.destinationCableId);
      
      if (!sourceCable || !destCable) {
        return res.status(400).json({ error: "Source or destination cable not found" });
      }
      
      if (req.body.sourceStartFiber < 1 || req.body.sourceEndFiber > sourceCable.fiberCount) {
        return res.status(400).json({ error: `Source fiber range must be between 1 and ${sourceCable.fiberCount}` });
      }
      
      if (req.body.destinationStartFiber < 1 || req.body.destinationEndFiber > destCable.fiberCount) {
        return res.status(400).json({ error: `Destination fiber range must be between 1 and ${destCable.fiberCount}` });
      }
      
      const sourceConflict = await storage.checkSpliceConflict(
        req.body.sourceCableId,
        req.body.sourceStartFiber,
        req.body.sourceEndFiber
      );
      
      if (sourceConflict) {
        return res.status(400).json({ 
          error: `Fiber conflict on source cable ${sourceCable.name}: fibers ${req.body.sourceStartFiber}-${req.body.sourceEndFiber} overlap with existing splice` 
        });
      }
      
      const destConflict = await storage.checkSpliceConflict(
        req.body.destinationCableId,
        req.body.destinationStartFiber,
        req.body.destinationEndFiber
      );
      
      if (destConflict) {
        return res.status(400).json({ 
          error: `Fiber conflict on destination cable ${destCable.name}: fibers ${req.body.destinationStartFiber}-${req.body.destinationEndFiber} overlap with existing splice` 
        });
      }
      
      const validatedData = insertSpliceSchema.parse(req.body);
      const splice = await storage.createSplice(validatedData);
      res.status(201).json(splice);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid splice data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to create splice" });
    }
  });

  app.put("/api/splices/:id", async (req, res) => {
    try {
      const existingSplice = await storage.getSplice(req.params.id);
      if (!existingSplice) {
        return res.status(404).json({ error: "Splice not found" });
      }
      
      const mergedData = { ...existingSplice, ...req.body };
      
      const sourceCable = await storage.getCable(mergedData.sourceCableId);
      const destCable = await storage.getCable(mergedData.destinationCableId);
      
      if (!sourceCable || !destCable) {
        return res.status(400).json({ error: "Source or destination cable not found" });
      }
      
      if (mergedData.sourceStartFiber < 1 || mergedData.sourceEndFiber > sourceCable.fiberCount) {
        return res.status(400).json({ error: `Source fiber range must be between 1 and ${sourceCable.fiberCount}` });
      }
      
      if (mergedData.destinationStartFiber < 1 || mergedData.destinationEndFiber > destCable.fiberCount) {
        return res.status(400).json({ error: `Destination fiber range must be between 1 and ${destCable.fiberCount}` });
      }
      
      const sourceConflict = await storage.checkSpliceConflict(
        mergedData.sourceCableId,
        mergedData.sourceStartFiber,
        mergedData.sourceEndFiber,
        req.params.id
      );
      
      if (sourceConflict) {
        return res.status(400).json({ 
          error: `Fiber conflict on source cable ${sourceCable.name}: fibers ${mergedData.sourceStartFiber}-${mergedData.sourceEndFiber} overlap with existing splice` 
        });
      }
      
      const destConflict = await storage.checkSpliceConflict(
        mergedData.destinationCableId,
        mergedData.destinationStartFiber,
        mergedData.destinationEndFiber,
        req.params.id
      );
      
      if (destConflict) {
        return res.status(400).json({ 
          error: `Fiber conflict on destination cable ${destCable.name}: fibers ${mergedData.destinationStartFiber}-${mergedData.destinationEndFiber} overlap with existing splice` 
        });
      }
      
      insertSpliceSchema.parse(mergedData);
      
      const splice = await storage.updateSplice(req.params.id, req.body);
      res.json(splice);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid splice data", details: error.errors });
      }
      res.status(500).json({ error: "Failed to update splice" });
    }
  });

  app.delete("/api/splices/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteSplice(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Splice not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete splice" });
    }
  });

  // Save/Load routes
  app.get("/api/saves", async (_req, res) => {
    try {
      const saves = await storage.getAllSaves();
      res.json(saves);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch saves" });
    }
  });

  app.post("/api/saves", async (req, res) => {
    try {
      // Get current cables and circuits
      const cables = await storage.getAllCables();
      const circuits = await storage.getAllCircuits();
      
      // Create timestamp name in format: MM/DD/YYYY HH:MM AM/PM
      const now = new Date();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const year = now.getFullYear();
      let hours = now.getHours();
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12; // 0 should be 12
      const formattedHours = String(hours).padStart(2, '0');
      const name = `${month}/${day}/${year} ${formattedHours}:${minutes} ${ampm}`;
      
      const saveData = {
        name,
        data: JSON.stringify({ cables, circuits }),
      };
      
      const save = await storage.createSave(saveData);
      res.status(201).json(save);
    } catch (error) {
      res.status(500).json({ error: "Failed to create save" });
    }
  });

  app.post("/api/saves/:id/load", async (req, res) => {
    try {
      const saveData = await storage.loadSave(req.params.id);
      if (!saveData) {
        return res.status(404).json({ error: "Save not found" });
      }
      
      // Clear current data
      await storage.resetAllData();
      
      // Map old cable IDs to new cable IDs
      const cableIdMap = new Map<string, string>();
      
      // Restore cables and build ID mapping
      for (const cable of saveData.cables) {
        const newCable = await storage.createCable({
          name: cable.name,
          fiberCount: cable.fiberCount,
          type: cable.type as "Feed" | "Distribution",
        });
        cableIdMap.set(cable.id, newCable.id);
      }
      
      // Restore circuits with updated cable IDs and splice status
      for (const circuit of saveData.circuits) {
        const newCableId = cableIdMap.get(circuit.cableId);
        if (!newCableId) continue; // Skip if cable mapping not found
        
        // Remap feedCableId if it exists
        const newFeedCableId = circuit.feedCableId ? cableIdMap.get(circuit.feedCableId) : undefined;
        
        const newCircuit = await storage.createCircuit({
          cableId: newCableId,
          circuitId: circuit.circuitId,
          position: circuit.position,
          fiberStart: circuit.fiberStart,
          fiberEnd: circuit.fiberEnd,
        });
        
        // Restore splice status and Feed cable mapping if circuit was spliced
        if (circuit.isSpliced === 1 && newFeedCableId) {
          await storage.updateCircuit(newCircuit.id, {
            isSpliced: 1,
            feedCableId: newFeedCableId,
            feedFiberStart: circuit.feedFiberStart,
            feedFiberEnd: circuit.feedFiberEnd,
          } as Partial<Circuit>);
        }
      }
      
      res.json({ message: "Save loaded successfully" });
    } catch (error) {
      console.error("Error loading save:", error);
      res.status(500).json({ error: "Failed to load save" });
    }
  });

  // Settings routes
  app.get("/api/settings", async (_req, res) => {
    try {
      const settings = await storage.getSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.patch("/api/settings", async (req, res) => {
    try {
      const validatedData = insertSettingsSchema.parse(req.body);
      const settings = await storage.updateSettings(validatedData);
      res.json(settings);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  app.delete("/api/reset", async (_req, res) => {
    try {
      await storage.resetAllData();
      res.status(200).json({ message: "All data has been reset successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to reset data" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
