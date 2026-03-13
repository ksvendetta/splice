import { getDb } from './db';
import type { Cable, Circuit, Save, InsertCable, InsertCircuit } from '@/../../shared/schema';
import { nanoid } from 'nanoid';

// Storage service using IndexedDB (Dexie)
export const storage = {
  // Cable operations
  async getAllCables(mode: 'fiber' | 'copper' = 'fiber'): Promise<Cable[]> {
    return await getDb(mode).cables.toArray();
  },

  async getCable(id: string, mode: 'fiber' | 'copper' = 'fiber'): Promise<Cable | undefined> {
    return await getDb(mode).cables.get(id);
  },

  async createCable(cable: InsertCable, mode: 'fiber' | 'copper' = 'fiber'): Promise<Cable> {
    const newCable: Cable = {
      id: nanoid(),
      ribbonSize: mode === 'fiber' ? 12 : 25, // 12 fibers per ribbon for fiber, 25 pairs per binder for copper
      ...cable,
      parentCableId: cable.parentCableId ?? null,
      spliceName: cable.spliceName ?? null,
    };
    await getDb(mode).cables.add(newCable);
    return newCable;
  },

  async updateCable(id: string, updates: Partial<Cable>, mode: 'fiber' | 'copper' = 'fiber'): Promise<void> {
    await getDb(mode).cables.update(id, updates);
  },

  async deleteCable(id: string, mode: 'fiber' | 'copper' = 'fiber'): Promise<void> {
    const db = getDb(mode);
    // Recursively delete child cables (sub-splices) first
    const children = await db.cables.filter(c => c.parentCableId === id).toArray();
    for (const child of children) {
      await storage.deleteCable(child.id, mode);
    }
    // Delete associated circuits then the cable itself
    await db.circuits.where('cableId').equals(id).delete();
    await db.cables.delete(id);
  },

  // Circuit operations
  async getAllCircuits(mode: 'fiber' | 'copper' = 'fiber'): Promise<Circuit[]> {
    return await getDb(mode).circuits.toArray();
  },

  async getCircuit(id: string, mode: 'fiber' | 'copper' = 'fiber'): Promise<Circuit | undefined> {
    return await getDb(mode).circuits.get(id);
  },

  async getCircuitsByCableId(cableId: string, mode: 'fiber' | 'copper' = 'fiber'): Promise<Circuit[]> {
    return await getDb(mode).circuits
      .where('cableId')
      .equals(cableId)
      .sortBy('position');
  },

  async createCircuit(circuit: InsertCircuit & { position: number; fiberStart: number; fiberEnd: number }, mode: 'fiber' | 'copper' = 'fiber'): Promise<Circuit> {
    const newCircuit: Circuit = {
      id: nanoid(),
      ...circuit,
      isSpliced: 0,
      feedCableId: null,
      feedFiberStart: null,
      feedFiberEnd: null
    };
    await getDb(mode).circuits.add(newCircuit);
    return newCircuit;
  },

  async updateCircuit(id: string, updates: Partial<Circuit>, mode: 'fiber' | 'copper' = 'fiber'): Promise<void> {
    await getDb(mode).circuits.update(id, updates);
  },

  async bulkUpdateCircuits(updates: Array<{ id: string; changes: Partial<Circuit> }>, mode: 'fiber' | 'copper' = 'fiber'): Promise<void> {
    // Use Promise.all for parallel updates instead of sequential
    await Promise.all(updates.map(({ id, changes }) => getDb(mode).circuits.update(id, changes)));
  },

  async deleteCircuit(id: string, mode: 'fiber' | 'copper' = 'fiber'): Promise<void> {
    await getDb(mode).circuits.delete(id);
  },

  // Save operations
  async getAllSaves(mode: 'fiber' | 'copper' = 'fiber'): Promise<Save[]> {
    return await getDb(mode).saves.orderBy('createdAt').reverse().toArray();
  },

  async getSave(id: string, mode: 'fiber' | 'copper' = 'fiber'): Promise<Save | undefined> {
    return await getDb(mode).saves.get(id);
  },

  async createSave(name: string, mode: 'fiber' | 'copper' = 'fiber'): Promise<Save> {
    const db = getDb(mode);
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

  async deleteSave(id: string, mode: 'fiber' | 'copper' = 'fiber'): Promise<void> {
    await getDb(mode).saves.delete(id);
  },

  async loadSave(id: string, mode: 'fiber' | 'copper' = 'fiber'): Promise<void> {
    const db = getDb(mode);
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

  async resetAllData(mode: 'fiber' | 'copper' = 'fiber'): Promise<void> {
    const db = getDb(mode);
    await db.cables.clear();
    await db.circuits.clear();
  }
};
