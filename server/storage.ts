import { type Cable, type InsertCable, type Circuit, type InsertCircuit, type Splice, type InsertSplice, type Save, type InsertSave, type Settings, type InsertSettings } from "@shared/schema";

// Simple UUID generator
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export interface IStorage {
  getAllCables(): Promise<Cable[]>;
  getCable(id: string): Promise<Cable | undefined>;
  createCable(cable: InsertCable, ribbonSize?: number): Promise<Cable>;
  updateCable(id: string, cable: InsertCable): Promise<Cable | undefined>;
  deleteCable(id: string): Promise<boolean>;
  
  getAllCircuits(): Promise<Circuit[]>;
  getCircuitsByCableId(cableId: string): Promise<Circuit[]>;
  getCircuit(id: string): Promise<Circuit | undefined>;
  createCircuit(circuit: InsertCircuit): Promise<Circuit>;
  updateCircuit(id: string, circuit: Partial<Circuit>): Promise<Circuit | undefined>;
  toggleCircuitSpliced(id: string, feedCableId?: string, feedFiberStart?: number, feedFiberEnd?: number): Promise<Circuit | undefined>;
  deleteCircuit(id: string): Promise<boolean>;
  deleteCircuitsByCableId(cableId: string): Promise<void>;
  
  getAllSplices(): Promise<Splice[]>;
  getSplice(id: string): Promise<Splice | undefined>;
  createSplice(splice: InsertSplice): Promise<Splice>;
  updateSplice(id: string, splice: Partial<InsertSplice>): Promise<Splice | undefined>;
  deleteSplice(id: string): Promise<boolean>;
  deleteSplicesByCableId(cableId: string): Promise<void>;
  checkSpliceConflict(cableId: string, startFiber: number, endFiber: number, excludeSpliceId?: string): Promise<Splice | null>;
  
  getAllSaves(): Promise<Save[]>;
  createSave(save: InsertSave): Promise<Save>;
  loadSave(id: string): Promise<{ cables: Cable[], circuits: Circuit[] } | undefined>;
  cleanupOldSaves(): Promise<void>;
  
  getSettings(): Promise<Settings>;
  updateSettings(settings: InsertSettings): Promise<Settings>;
  
  resetAllData(): Promise<void>;
}

// In-memory storage implementation (data lives in server memory)
export class MemStorage implements IStorage {
  private cables: Map<string, Cable> = new Map();
  private circuits: Map<string, Circuit> = new Map();
  private splices: Map<string, Splice> = new Map();
  private saves: Map<string, Save> = new Map();
  private settings: Settings = { id: 1, spliceMode: "fiber" };

  // Cable operations
  async getAllCables(): Promise<Cable[]> {
    return Array.from(this.cables.values());
  }

  async getCable(id: string): Promise<Cable | undefined> {
    return this.cables.get(id);
  }

  async createCable(insertCable: InsertCable, ribbonSize: number = 12): Promise<Cable> {
    const cable: Cable = {
      id: generateId(),
      name: insertCable.name,
      fiberCount: insertCable.fiberCount,
      ribbonSize: ribbonSize,
      type: insertCable.type,
    };
    this.cables.set(cable.id, cable);
    return cable;
  }

  async updateCable(id: string, insertCable: InsertCable): Promise<Cable | undefined> {
    const cable = this.cables.get(id);
    if (!cable) return undefined;

    const updated: Cable = {
      ...cable,
      name: insertCable.name,
      fiberCount: insertCable.fiberCount,
      type: insertCable.type,
    };
    this.cables.set(id, updated);
    return updated;
  }

  async deleteCable(id: string): Promise<boolean> {
    await this.deleteSplicesByCableId(id);
    await this.deleteCircuitsByCableId(id);
    const result = this.cables.delete(id);
    return result;
  }

  // Circuit operations
  async getAllCircuits(): Promise<Circuit[]> {
    return Array.from(this.circuits.values());
  }

  async getCircuitsByCableId(cableId: string): Promise<Circuit[]> {
    return Array.from(this.circuits.values())
      .filter(c => c.cableId === cableId)
      .sort((a, b) => a.position - b.position);
  }

  async getCircuit(id: string): Promise<Circuit | undefined> {
    return this.circuits.get(id);
  }

  async createCircuit(insertCircuit: InsertCircuit & { position: number; fiberStart: number; fiberEnd: number }): Promise<Circuit> {
    const circuit: Circuit = {
      id: generateId(),
      cableId: insertCircuit.cableId,
      circuitId: insertCircuit.circuitId,
      position: insertCircuit.position,
      fiberStart: insertCircuit.fiberStart,
      fiberEnd: insertCircuit.fiberEnd,
      isSpliced: 0,
      feedCableId: null,
      feedFiberStart: null,
      feedFiberEnd: null,
    };
    this.circuits.set(circuit.id, circuit);
    return circuit;
  }

  async updateCircuit(id: string, partialCircuit: Partial<InsertCircuit>): Promise<Circuit | undefined> {
    const circuit = this.circuits.get(id);
    if (!circuit) return undefined;

    const updated: Circuit = { ...circuit, ...partialCircuit };
    this.circuits.set(id, updated);
    return updated;
  }

  async toggleCircuitSpliced(id: string, feedCableId?: string, feedFiberStart?: number, feedFiberEnd?: number): Promise<Circuit | undefined> {
    const circuit = this.circuits.get(id);
    if (!circuit) return undefined;

    const newSplicedStatus = circuit.isSpliced === 1 ? 0 : 1;
    const updateData: Partial<Circuit> = { isSpliced: newSplicedStatus };

    if (newSplicedStatus === 1) {
      updateData.feedCableId = feedCableId || null;
      updateData.feedFiberStart = feedFiberStart !== undefined ? feedFiberStart : null;
      updateData.feedFiberEnd = feedFiberEnd !== undefined ? feedFiberEnd : null;
    } else {
      updateData.feedCableId = null;
      updateData.feedFiberStart = null;
      updateData.feedFiberEnd = null;
    }

    return this.updateCircuit(id, updateData);
  }

  async deleteCircuit(id: string): Promise<boolean> {
    const result = this.circuits.delete(id);
    return result;
  }

  async deleteCircuitsByCableId(cableId: string): Promise<void> {
    const circuitsToDelete = Array.from(this.circuits.values())
      .filter(c => c.cableId === cableId)
      .map(c => c.id);

    circuitsToDelete.forEach(id => this.circuits.delete(id));
  }

  // Splice operations
  async getAllSplices(): Promise<Splice[]> {
    return Array.from(this.splices.values());
  }

  async getSplice(id: string): Promise<Splice | undefined> {
    return this.splices.get(id);
  }

  async createSplice(insertSplice: InsertSplice): Promise<Splice> {
    const splice: Splice = {
      id: generateId(),
      sourceCableId: insertSplice.sourceCableId,
      destinationCableId: insertSplice.destinationCableId,
      sourceRibbon: insertSplice.sourceRibbon,
      sourceStartFiber: insertSplice.sourceStartFiber,
      sourceEndFiber: insertSplice.sourceEndFiber,
      destinationRibbon: insertSplice.destinationRibbon,
      destinationStartFiber: insertSplice.destinationStartFiber,
      destinationEndFiber: insertSplice.destinationEndFiber,
      ponStart: insertSplice.ponStart ?? null,
      ponEnd: insertSplice.ponEnd ?? null,
      isCompleted: 0,
    };
    this.splices.set(splice.id, splice);
    return splice;
  }

  async updateSplice(id: string, partialSplice: Partial<InsertSplice>): Promise<Splice | undefined> {
    const splice = this.splices.get(id);
    if (!splice) return undefined;

    const updated: Splice = { ...splice, ...partialSplice };
    this.splices.set(id, updated);
    return updated;
  }

  async deleteSplice(id: string): Promise<boolean> {
    const result = this.splices.delete(id);
    return result;
  }

  async deleteSplicesByCableId(cableId: string): Promise<void> {
    const splicesToDelete = Array.from(this.splices.values())
      .filter(s => s.sourceCableId === cableId || s.destinationCableId === cableId)
      .map(s => s.id);

    splicesToDelete.forEach(id => this.splices.delete(id));
  }

  async checkSpliceConflict(cableId: string, startFiber: number, endFiber: number, excludeSpliceId?: string): Promise<Splice | null> {
    const conflicting = Array.from(this.splices.values()).find(s => {
      if (excludeSpliceId && s.id === excludeSpliceId) return false;

      const isSourceCable = s.sourceCableId === cableId;
      const isDestCable = s.destinationCableId === cableId;

      if (!isSourceCable && !isDestCable) return false;

      const spliceStart = isSourceCable ? s.sourceStartFiber : s.destinationStartFiber;
      const spliceEnd = isSourceCable ? s.sourceEndFiber : s.destinationEndFiber;

      return !(endFiber < spliceStart || startFiber > spliceEnd);
    });

    return conflicting || null;
  }

  // Save/Load operations
  async getAllSaves(): Promise<Save[]> {
    return Array.from(this.saves.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async createSave(insertSave: InsertSave): Promise<Save> {
    const save: Save = {
      id: generateId(),
      name: insertSave.name,
      createdAt: new Date().toISOString(),
      data: insertSave.data,
    };
    this.saves.set(save.id, save);

    // Cleanup old saves (keep max 50)
    await this.cleanupOldSaves();

    return save;
  }

  async loadSave(id: string): Promise<{ cables: Cable[], circuits: Circuit[] } | undefined> {
    const save = this.saves.get(id);
    if (!save) return undefined;

    try {
      const { cables, circuits } = JSON.parse(save.data);
      return { cables, circuits };
    } catch (error) {
      console.error('Failed to parse save data:', error);
      return undefined;
    }
  }

  async cleanupOldSaves(): Promise<void> {
    const allSaves = await this.getAllSaves();
    if (allSaves.length > 50) {
      const savesToDelete = allSaves.slice(50);
      savesToDelete.forEach(save => this.saves.delete(save.id));
    }
  }

  // Settings operations
  async getSettings(): Promise<Settings> {
    return this.settings;
  }

  async updateSettings(insertSettings: InsertSettings): Promise<Settings> {
    this.settings = { ...this.settings, ...insertSettings };
    return this.settings;
  }

  async resetAllData(): Promise<void> {
    this.cables.clear();
    this.circuits.clear();
    this.splices.clear();
  }
}

// Import SQLite storage for persistent local storage
import { SQLiteStorage } from './sqlite-storage';

// Use SQLite storage for persistent data (survives server restarts)
export const storage = new SQLiteStorage();
