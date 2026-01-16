import { db } from './db';
import type { Cable, Circuit, Save, InsertCable, InsertCircuit } from '@/../../shared/schema';
import { nanoid } from 'nanoid';

// Storage service using IndexedDB (Dexie)
export const storage = {
  // Cable operations
  async getAllCables(): Promise<Cable[]> {
    return await db.cables.toArray();
  },

  async getCable(id: string): Promise<Cable | undefined> {
    return await db.cables.get(id);
  },

  async createCable(cable: InsertCable): Promise<Cable> {
    const newCable: Cable = {
      id: nanoid(),
      ribbonSize: 12,
      ...cable
    };
    await db.cables.add(newCable);
    return newCable;
  },

  async updateCable(id: string, updates: Partial<Cable>): Promise<void> {
    await db.cables.update(id, updates);
  },

  async deleteCable(id: string): Promise<void> {
    // Delete associated circuits first
    await db.circuits.where('cableId').equals(id).delete();
    await db.cables.delete(id);
  },

  // Circuit operations
  async getAllCircuits(): Promise<Circuit[]> {
    return await db.circuits.toArray();
  },

  async getCircuit(id: string): Promise<Circuit | undefined> {
    return await db.circuits.get(id);
  },

  async getCircuitsByCableId(cableId: string): Promise<Circuit[]> {
    return await db.circuits
      .where('cableId')
      .equals(cableId)
      .sortBy('position');
  },

  async createCircuit(circuit: InsertCircuit & { position: number; fiberStart: number; fiberEnd: number }): Promise<Circuit> {
    const newCircuit: Circuit = {
      id: nanoid(),
      ...circuit,
      isSpliced: 0,
      feedCableId: null,
      feedFiberStart: null,
      feedFiberEnd: null
    };
    await db.circuits.add(newCircuit);
    return newCircuit;
  },

  async updateCircuit(id: string, updates: Partial<Circuit>): Promise<void> {
    await db.circuits.update(id, updates);
  },

  async bulkUpdateCircuits(updates: Array<{ id: string; changes: Partial<Circuit> }>): Promise<void> {
    // Use transaction for better performance
    await db.transaction('rw', db.circuits, async () => {
      for (const { id, changes } of updates) {
        await db.circuits.update(id, changes);
      }
    });
  },

  async deleteCircuit(id: string): Promise<void> {
    await db.circuits.delete(id);
  },

  // Save operations
  async getAllSaves(): Promise<Save[]> {
    return await db.saves.orderBy('createdAt').reverse().toArray();
  },

  async getSave(id: string): Promise<Save | undefined> {
    return await db.saves.get(id);
  },

  async createSave(name: string): Promise<Save> {
    const cables = await db.cables.toArray();
    const circuits = await db.circuits.toArray();
    
    const newSave: Save = {
      id: nanoid(),
      name,
      createdAt: new Date().toISOString(),
      data: JSON.stringify({ cables, circuits })
    };
    
    await db.saves.add(newSave);
    
    // Keep only last 50 saves
    const allSaves = await db.saves.orderBy('createdAt').reverse().toArray();
    if (allSaves.length > 50) {
      const oldSaves = allSaves.slice(50);
      await Promise.all(oldSaves.map(s => db.saves.delete(s.id)));
    }
    
    return newSave;
  },

  async deleteSave(id: string): Promise<void> {
    await db.saves.delete(id);
  },

  async loadSave(id: string): Promise<void> {
    const save = await db.saves.get(id);
    if (!save) throw new Error('Save not found');
    
    const saveData = JSON.parse(save.data);
    
    // Clear existing data
    await db.cables.clear();
    await db.circuits.clear();
    
    // Restore cables and circuits
    await db.cables.bulkAdd(saveData.cables);
    await db.circuits.bulkAdd(saveData.circuits);
  },

  async resetAllData(): Promise<void> {
    await db.cables.clear();
    await db.circuits.clear();
  }
};
