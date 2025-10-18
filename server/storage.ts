import { cables, splices, type Cable, type InsertCable, type Splice, type InsertSplice } from "@shared/schema";
import { db } from "./db";
import { eq, or } from "drizzle-orm";

export interface IStorage {
  getAllCables(): Promise<Cable[]>;
  getCable(id: string): Promise<Cable | undefined>;
  createCable(cable: InsertCable): Promise<Cable>;
  updateCable(id: string, cable: InsertCable): Promise<Cable | undefined>;
  deleteCable(id: string): Promise<boolean>;
  
  getAllSplices(): Promise<Splice[]>;
  getSplice(id: string): Promise<Splice | undefined>;
  createSplice(splice: InsertSplice): Promise<Splice>;
  updateSplice(id: string, splice: Partial<InsertSplice>): Promise<Splice | undefined>;
  deleteSplice(id: string): Promise<boolean>;
  deleteSplicesByCableId(cableId: string): Promise<void>;
  checkSpliceConflict(cableId: string, startFiber: number, endFiber: number, excludeSpliceId?: string): Promise<Splice | null>;
}

export class DatabaseStorage implements IStorage {
  async getAllCables(): Promise<Cable[]> {
    return await db.select().from(cables);
  }

  async getCable(id: string): Promise<Cable | undefined> {
    const [cable] = await db.select().from(cables).where(eq(cables.id, id));
    return cable || undefined;
  }

  async createCable(insertCable: InsertCable): Promise<Cable> {
    const [cable] = await db
      .insert(cables)
      .values({
        name: insertCable.name,
        fiberCount: insertCable.fiberCount,
        ribbonSize: insertCable.ribbonSize ?? 12,
        type: insertCable.type,
      })
      .returning();
    return cable;
  }

  async updateCable(id: string, insertCable: InsertCable): Promise<Cable | undefined> {
    const [cable] = await db
      .update(cables)
      .set({
        name: insertCable.name,
        fiberCount: insertCable.fiberCount,
        ribbonSize: insertCable.ribbonSize ?? 12,
        type: insertCable.type,
      })
      .where(eq(cables.id, id))
      .returning();
    return cable || undefined;
  }

  async deleteCable(id: string): Promise<boolean> {
    await this.deleteSplicesByCableId(id);
    const result = await db.delete(cables).where(eq(cables.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async getAllSplices(): Promise<Splice[]> {
    return await db.select().from(splices);
  }

  async getSplice(id: string): Promise<Splice | undefined> {
    const [splice] = await db.select().from(splices).where(eq(splices.id, id));
    return splice || undefined;
  }

  async createSplice(insertSplice: InsertSplice): Promise<Splice> {
    const [splice] = await db
      .insert(splices)
      .values({
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
        isCompleted: insertSplice.isCompleted ?? 0,
      })
      .returning();
    return splice;
  }

  async updateSplice(id: string, partialSplice: Partial<InsertSplice>): Promise<Splice | undefined> {
    const [splice] = await db
      .update(splices)
      .set(partialSplice)
      .where(eq(splices.id, id))
      .returning();
    return splice || undefined;
  }

  async deleteSplice(id: string): Promise<boolean> {
    const result = await db.delete(splices).where(eq(splices.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async deleteSplicesByCableId(cableId: string): Promise<void> {
    await db.delete(splices).where(
      or(
        eq(splices.sourceCableId, cableId),
        eq(splices.destinationCableId, cableId)
      )
    );
  }

  async checkSpliceConflict(cableId: string, startFiber: number, endFiber: number, excludeSpliceId?: string): Promise<Splice | null> {
    const allSplices = await db.select().from(splices).where(
      or(
        eq(splices.sourceCableId, cableId),
        eq(splices.destinationCableId, cableId)
      )
    );

    for (const splice of allSplices) {
      if (excludeSpliceId && splice.id === excludeSpliceId) {
        continue;
      }

      const isSourceCable = splice.sourceCableId === cableId;
      const spliceStart = isSourceCable ? splice.sourceStartFiber : splice.destinationStartFiber;
      const spliceEnd = isSourceCable ? splice.sourceEndFiber : splice.destinationEndFiber;

      const hasOverlap = !(endFiber < spliceStart || startFiber > spliceEnd);
      if (hasOverlap) {
        return splice;
      }
    }

    return null;
  }
}

export const storage = new DatabaseStorage();
