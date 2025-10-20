import { db } from "./db";
import { cables, circuits, saves } from "@shared/schema";
import type { Cable, Circuit, Save, InsertCable, InsertCircuit, InsertSave } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export const storage = {
  // Cable operations
  async getAllCables(): Promise<Cable[]> {
    return await db.select().from(cables);
  },

  async getCable(id: string): Promise<Cable | undefined> {
    const result = await db.select().from(cables).where(eq(cables.id, id));
    return result[0];
  },

  async createCable(data: InsertCable): Promise<Cable> {
    const result = await db.insert(cables).values(data).returning();
    return result[0];
  },

  async updateCable(id: string, data: Partial<InsertCable>): Promise<Cable | undefined> {
    const result = await db.update(cables).set(data).where(eq(cables.id, id)).returning();
    return result[0];
  },

  async deleteCable(id: string): Promise<void> {
    await db.delete(cables).where(eq(cables.id, id));
  },

  // Circuit operations
  async getAllCircuits(): Promise<Circuit[]> {
    return await db.select().from(circuits);
  },

  async getCircuit(id: string): Promise<Circuit | undefined> {
    const result = await db.select().from(circuits).where(eq(circuits.id, id));
    return result[0];
  },

  async getCircuitsByCableId(cableId: string): Promise<Circuit[]> {
    return await db.select().from(circuits).where(eq(circuits.cableId, cableId));
  },

  async createCircuit(data: InsertCircuit): Promise<Circuit> {
    const result = await db.insert(circuits).values(data as any).returning();
    return result[0];
  },

  async updateCircuit(id: string, data: Partial<Circuit>): Promise<Circuit | undefined> {
    const result = await db.update(circuits).set(data).where(eq(circuits.id, id)).returning();
    return result[0];
  },

  async deleteCircuit(id: string): Promise<void> {
    await db.delete(circuits).where(eq(circuits.id, id));
  },

  // Save operations
  async getAllSaves(): Promise<Save[]> {
    return await db.select().from(saves).orderBy(desc(saves.createdAt));
  },

  async getSave(id: string): Promise<Save | undefined> {
    const result = await db.select().from(saves).where(eq(saves.id, id));
    return result[0];
  },

  async createSave(data: InsertSave): Promise<Save> {
    const result = await db.insert(saves).values(data).returning();
    
    // Keep only last 50 saves - delete oldest ones
    const allSaves = await db.select().from(saves).orderBy(desc(saves.createdAt));
    if (allSaves.length > 50) {
      const oldSaves = allSaves.slice(50);
      for (const oldSave of oldSaves) {
        await db.delete(saves).where(eq(saves.id, oldSave.id));
      }
    }
    
    return result[0];
  },

  async deleteSave(id: string): Promise<void> {
    await db.delete(saves).where(eq(saves.id, id));
  },

  async loadSave(id: string): Promise<{ cables: Cable[]; circuits: Circuit[] } | null> {
    const save = await this.getSave(id);
    if (!save) return null;
    
    const saveData = JSON.parse(save.data);
    return saveData;
  },

  async resetAllData(): Promise<void> {
    await db.delete(circuits);
    await db.delete(cables);
  }
};
