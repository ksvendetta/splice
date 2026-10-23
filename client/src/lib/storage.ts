import { getDb } from './db';
import type { Cable, Circuit, Save, InsertCable, InsertCircuit } from '@/../../shared/schema';
import { nanoid } from 'nanoid';

// How many saves History keeps per mode. Reset adds one each time, so this is
// the window of old projects a user can go back to.
export const MAX_SAVES = 20;

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
    // Reset clears the splice name too, so keep it with the save or a restore
    // would come back unnamed.
    const spliceName = localStorage.getItem(`spliceName-${mode}`);

    const newSave: Save = {
      id: nanoid(),
      name,
      createdAt: new Date().toISOString(),
      data: JSON.stringify({ mode, cables, circuits, spliceName })
    };

    await db.saves.add(newSave);

    // Keep only the newest MAX_SAVES; the oldest fall off the end.
    const allSaves = await db.saves.orderBy('createdAt').reverse().toArray();
    if (allSaves.length > MAX_SAVES) {
      const oldSaves = allSaves.slice(MAX_SAVES);
      await Promise.all(oldSaves.map(s => db.saves.delete(s.id)));
    }

    return newSave;
  },

  async deleteSave(id: string, mode: 'fiber' | 'copper' = 'fiber'): Promise<void> {
    await getDb(mode).saves.delete(id);
  },

  async deleteAllSaves(mode: 'fiber' | 'copper' = 'fiber'): Promise<void> {
    await getDb(mode).saves.clear();
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

    // Saves written before spliceName was stored simply have nothing to restore.
    if (saveData.spliceName) {
      localStorage.setItem(`spliceName-${mode}`, saveData.spliceName);
    } else {
      localStorage.removeItem(`spliceName-${mode}`);
    }
  },

  async getProjectSnapshot(mode: 'fiber' | 'copper' = 'fiber'): Promise<{ cables: Cable[]; circuits: Circuit[] }> {
    const db = getDb(mode);
    const [cables, circuits] = await Promise.all([
      db.cables.toArray(),
      db.circuits.toArray(),
    ]);
    return { cables, circuits };
  },

  async restoreProjectSnapshot(snapshot: { cables: Cable[]; circuits: Circuit[] }, mode: 'fiber' | 'copper' = 'fiber'): Promise<void> {
    const db = getDb(mode);
    await db.transaction('rw', db.cables, db.circuits, async () => {
      await db.cables.clear();
      await db.circuits.clear();
      if (snapshot.cables.length > 0) {
        await db.cables.bulkAdd(snapshot.cables);
      }
      if (snapshot.circuits.length > 0) {
        await db.circuits.bulkAdd(snapshot.circuits);
      }
    });
  },

  async resetAllData(mode: 'fiber' | 'copper' = 'fiber'): Promise<void> {
    const db = getDb(mode);
    await db.cables.clear();
    await db.circuits.clear();
  }
};
