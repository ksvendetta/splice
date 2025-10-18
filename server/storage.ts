import { type Cable, type InsertCable, type Splice, type InsertSplice } from "@shared/schema";
import { randomUUID } from "crypto";

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
}

export class MemStorage implements IStorage {
  private cables: Map<string, Cable>;
  private splices: Map<string, Splice>;

  constructor() {
    this.cables = new Map();
    this.splices = new Map();
  }

  async getAllCables(): Promise<Cable[]> {
    return Array.from(this.cables.values());
  }

  async getCable(id: string): Promise<Cable | undefined> {
    return this.cables.get(id);
  }

  async createCable(insertCable: InsertCable): Promise<Cable> {
    const id = randomUUID();
    const cable: Cable = {
      id,
      name: insertCable.name,
      fiberCount: insertCable.fiberCount,
      ribbonSize: insertCable.ribbonSize ?? 12,
      type: insertCable.type,
    };
    this.cables.set(id, cable);
    return cable;
  }

  async updateCable(id: string, insertCable: InsertCable): Promise<Cable | undefined> {
    const existingCable = this.cables.get(id);
    if (!existingCable) {
      return undefined;
    }
    const updatedCable: Cable = {
      id,
      name: insertCable.name,
      fiberCount: insertCable.fiberCount,
      ribbonSize: insertCable.ribbonSize ?? 12,
      type: insertCable.type,
    };
    this.cables.set(id, updatedCable);
    return updatedCable;
  }

  async deleteCable(id: string): Promise<boolean> {
    const deleted = this.cables.delete(id);
    if (deleted) {
      await this.deleteSplicesByCableId(id);
    }
    return deleted;
  }

  async getAllSplices(): Promise<Splice[]> {
    return Array.from(this.splices.values());
  }

  async getSplice(id: string): Promise<Splice | undefined> {
    return this.splices.get(id);
  }

  async createSplice(insertSplice: InsertSplice): Promise<Splice> {
    const id = randomUUID();
    const splice: Splice = {
      id,
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
    };
    this.splices.set(id, splice);
    return splice;
  }

  async updateSplice(id: string, partialSplice: Partial<InsertSplice>): Promise<Splice | undefined> {
    const existingSplice = this.splices.get(id);
    if (!existingSplice) {
      return undefined;
    }
    const updatedSplice: Splice = { ...existingSplice, ...partialSplice };
    this.splices.set(id, updatedSplice);
    return updatedSplice;
  }

  async deleteSplice(id: string): Promise<boolean> {
    return this.splices.delete(id);
  }

  async deleteSplicesByCableId(cableId: string): Promise<void> {
    const splicesToDelete = Array.from(this.splices.values()).filter(
      (splice) => splice.sourceCableId === cableId || splice.destinationCableId === cableId
    );
    
    for (const splice of splicesToDelete) {
      this.splices.delete(splice.id);
    }
  }
}

export const storage = new MemStorage();
