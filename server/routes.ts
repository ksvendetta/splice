import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertCableSchema, insertSpliceSchema } from "@shared/schema";
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
      const cable = await storage.createCable(validatedData);
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

  const httpServer = createServer(app);
  return httpServer;
}
