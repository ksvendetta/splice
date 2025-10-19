import Database from 'better-sqlite3';
import path from 'path';
import { type Cable, type InsertCable, type Circuit, type InsertCircuit, type Splice, type InsertSplice, type Save, type InsertSave, type Settings, type InsertSettings } from "@shared/schema";
import type { IStorage } from './storage';

// Simple UUID generator
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// SQLite storage implementation with persistent database file
export class SQLiteStorage implements IStorage {
  private db: Database.Database;

  constructor(dbPath?: string) {
    // Default to storing in the project root
    const dbFile = dbPath || path.join(process.cwd(), 'fiber-splice.db');
    this.db = new Database(dbFile);
    
    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');
    
    // Initialize database schema
    this.initializeSchema();
  }

  private initializeSchema(): void {
    // Create cables table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cables (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        fiberCount INTEGER NOT NULL,
        ribbonSize INTEGER DEFAULT 12,
        type TEXT NOT NULL CHECK(type IN ('Feed', 'Distribution'))
      )
    `);

    // Create circuits table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS circuits (
        id TEXT PRIMARY KEY,
        cableId TEXT NOT NULL,
        circuitId TEXT NOT NULL,
        position INTEGER NOT NULL,
        fiberStart INTEGER NOT NULL,
        fiberEnd INTEGER NOT NULL,
        isSpliced INTEGER DEFAULT 0,
        feedCableId TEXT,
        feedFiberStart INTEGER,
        feedFiberEnd INTEGER,
        FOREIGN KEY (cableId) REFERENCES cables(id) ON DELETE CASCADE
      )
    `);

    // Create splices table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS splices (
        id TEXT PRIMARY KEY,
        sourceCableId TEXT NOT NULL,
        destinationCableId TEXT NOT NULL,
        sourceRibbon INTEGER NOT NULL,
        sourceStartFiber INTEGER NOT NULL,
        sourceEndFiber INTEGER NOT NULL,
        destinationRibbon INTEGER NOT NULL,
        destinationStartFiber INTEGER NOT NULL,
        destinationEndFiber INTEGER NOT NULL,
        ponStart INTEGER,
        ponEnd INTEGER,
        isCompleted INTEGER DEFAULT 0,
        FOREIGN KEY (sourceCableId) REFERENCES cables(id) ON DELETE CASCADE,
        FOREIGN KEY (destinationCableId) REFERENCES cables(id) ON DELETE CASCADE
      )
    `);

    // Create saves table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS saves (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        data TEXT NOT NULL
      )
    `);

    // Create settings table (single row)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY DEFAULT 1,
        spliceMode TEXT NOT NULL DEFAULT 'fiber' CHECK(spliceMode IN ('fiber', 'copper'))
      )
    `);

    // Insert default settings if not exists
    this.db.exec(`
      INSERT OR IGNORE INTO settings (id, spliceMode) VALUES (1, 'fiber')
    `);

    // Create indexes for better performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_circuits_cableId ON circuits(cableId);
      CREATE INDEX IF NOT EXISTS idx_circuits_position ON circuits(cableId, position);
      CREATE INDEX IF NOT EXISTS idx_splices_source ON splices(sourceCableId);
      CREATE INDEX IF NOT EXISTS idx_splices_destination ON splices(destinationCableId);
      CREATE INDEX IF NOT EXISTS idx_saves_createdAt ON saves(createdAt DESC);
    `);
  }

  // Cable operations
  async getAllCables(): Promise<Cable[]> {
    const stmt = this.db.prepare('SELECT * FROM cables');
    return stmt.all() as Cable[];
  }

  async getCable(id: string): Promise<Cable | undefined> {
    const stmt = this.db.prepare('SELECT * FROM cables WHERE id = ?');
    return stmt.get(id) as Cable | undefined;
  }

  async createCable(insertCable: InsertCable, ribbonSize: number = 12): Promise<Cable> {
    const cable: Cable = {
      id: generateId(),
      name: insertCable.name,
      fiberCount: insertCable.fiberCount,
      ribbonSize: ribbonSize,
      type: insertCable.type,
    };
    
    const stmt = this.db.prepare(`
      INSERT INTO cables (id, name, fiberCount, ribbonSize, type)
      VALUES (@id, @name, @fiberCount, @ribbonSize, @type)
    `);
    stmt.run(cable);
    
    return cable;
  }

  async updateCable(id: string, insertCable: InsertCable): Promise<Cable | undefined> {
    const stmt = this.db.prepare(`
      UPDATE cables
      SET name = @name, fiberCount = @fiberCount, type = @type
      WHERE id = @id
    `);
    
    const result = stmt.run({
      id,
      name: insertCable.name,
      fiberCount: insertCable.fiberCount,
      type: insertCable.type,
    });
    
    if (result.changes === 0) return undefined;
    return this.getCable(id);
  }

  async deleteCable(id: string): Promise<boolean> {
    // Foreign key CASCADE will automatically delete related circuits and splices
    const stmt = this.db.prepare('DELETE FROM cables WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // Circuit operations
  async getAllCircuits(): Promise<Circuit[]> {
    const stmt = this.db.prepare('SELECT * FROM circuits');
    return stmt.all() as Circuit[];
  }

  async getCircuitsByCableId(cableId: string): Promise<Circuit[]> {
    const stmt = this.db.prepare('SELECT * FROM circuits WHERE cableId = ? ORDER BY position ASC');
    return stmt.all(cableId) as Circuit[];
  }

  async getCircuit(id: string): Promise<Circuit | undefined> {
    const stmt = this.db.prepare('SELECT * FROM circuits WHERE id = ?');
    return stmt.get(id) as Circuit | undefined;
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
    
    const stmt = this.db.prepare(`
      INSERT INTO circuits (id, cableId, circuitId, position, fiberStart, fiberEnd, isSpliced, feedCableId, feedFiberStart, feedFiberEnd)
      VALUES (@id, @cableId, @circuitId, @position, @fiberStart, @fiberEnd, @isSpliced, @feedCableId, @feedFiberStart, @feedFiberEnd)
    `);
    stmt.run(circuit);
    
    return circuit;
  }

  async updateCircuit(id: string, partialCircuit: Partial<Circuit>): Promise<Circuit | undefined> {
    const current = await this.getCircuit(id);
    if (!current) return undefined;

    const updated = { ...current, ...partialCircuit };
    
    const stmt = this.db.prepare(`
      UPDATE circuits
      SET cableId = @cableId, circuitId = @circuitId, position = @position,
          fiberStart = @fiberStart, fiberEnd = @fiberEnd, isSpliced = @isSpliced,
          feedCableId = @feedCableId, feedFiberStart = @feedFiberStart, feedFiberEnd = @feedFiberEnd
      WHERE id = @id
    `);
    
    stmt.run(updated);
    return this.getCircuit(id);
  }

  async toggleCircuitSpliced(id: string, feedCableId?: string, feedFiberStart?: number, feedFiberEnd?: number): Promise<Circuit | undefined> {
    const circuit = await this.getCircuit(id);
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
    const stmt = this.db.prepare('DELETE FROM circuits WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  async deleteCircuitsByCableId(cableId: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM circuits WHERE cableId = ?');
    stmt.run(cableId);
  }

  // Splice operations
  async getAllSplices(): Promise<Splice[]> {
    const stmt = this.db.prepare('SELECT * FROM splices');
    return stmt.all() as Splice[];
  }

  async getSplice(id: string): Promise<Splice | undefined> {
    const stmt = this.db.prepare('SELECT * FROM splices WHERE id = ?');
    return stmt.get(id) as Splice | undefined;
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
    
    const stmt = this.db.prepare(`
      INSERT INTO splices (id, sourceCableId, destinationCableId, sourceRibbon, sourceStartFiber, sourceEndFiber,
                          destinationRibbon, destinationStartFiber, destinationEndFiber, ponStart, ponEnd, isCompleted)
      VALUES (@id, @sourceCableId, @destinationCableId, @sourceRibbon, @sourceStartFiber, @sourceEndFiber,
              @destinationRibbon, @destinationStartFiber, @destinationEndFiber, @ponStart, @ponEnd, @isCompleted)
    `);
    stmt.run(splice);
    
    return splice;
  }

  async updateSplice(id: string, partialSplice: Partial<InsertSplice>): Promise<Splice | undefined> {
    const current = await this.getSplice(id);
    if (!current) return undefined;

    const updated = { ...current, ...partialSplice };
    
    const stmt = this.db.prepare(`
      UPDATE splices
      SET sourceCableId = @sourceCableId, destinationCableId = @destinationCableId,
          sourceRibbon = @sourceRibbon, sourceStartFiber = @sourceStartFiber, sourceEndFiber = @sourceEndFiber,
          destinationRibbon = @destinationRibbon, destinationStartFiber = @destinationStartFiber, destinationEndFiber = @destinationEndFiber,
          ponStart = @ponStart, ponEnd = @ponEnd, isCompleted = @isCompleted
      WHERE id = @id
    `);
    
    stmt.run(updated);
    return this.getSplice(id);
  }

  async deleteSplice(id: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM splices WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  async deleteSplicesByCableId(cableId: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM splices WHERE sourceCableId = ? OR destinationCableId = ?');
    stmt.run(cableId, cableId);
  }

  async checkSpliceConflict(cableId: string, startFiber: number, endFiber: number, excludeSpliceId?: string): Promise<Splice | null> {
    let query = `
      SELECT * FROM splices
      WHERE (sourceCableId = ? OR destinationCableId = ?)
    `;
    const params: any[] = [cableId, cableId];
    
    if (excludeSpliceId) {
      query += ' AND id != ?';
      params.push(excludeSpliceId);
    }
    
    const stmt = this.db.prepare(query);
    const splices = stmt.all(...params) as Splice[];
    
    for (const splice of splices) {
      const isSourceCable = splice.sourceCableId === cableId;
      const spliceStart = isSourceCable ? splice.sourceStartFiber : splice.destinationStartFiber;
      const spliceEnd = isSourceCable ? splice.sourceEndFiber : splice.destinationEndFiber;
      
      // Check if ranges overlap
      if (!(endFiber < spliceStart || startFiber > spliceEnd)) {
        return splice;
      }
    }
    
    return null;
  }

  // Save/Load operations
  async getAllSaves(): Promise<Save[]> {
    const stmt = this.db.prepare('SELECT * FROM saves ORDER BY createdAt DESC');
    return stmt.all() as Save[];
  }

  async createSave(insertSave: InsertSave): Promise<Save> {
    const save: Save = {
      id: generateId(),
      name: insertSave.name,
      createdAt: new Date().toISOString(),
      data: insertSave.data,
    };
    
    const stmt = this.db.prepare(`
      INSERT INTO saves (id, name, createdAt, data)
      VALUES (@id, @name, @createdAt, @data)
    `);
    stmt.run(save);
    
    // Cleanup old saves (keep max 50)
    await this.cleanupOldSaves();
    
    return save;
  }

  async loadSave(id: string): Promise<{ cables: Cable[], circuits: Circuit[] } | undefined> {
    const stmt = this.db.prepare('SELECT * FROM saves WHERE id = ?');
    const save = stmt.get(id) as Save | undefined;
    
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
    const stmt = this.db.prepare(`
      DELETE FROM saves
      WHERE id NOT IN (
        SELECT id FROM saves
        ORDER BY createdAt DESC
        LIMIT 50
      )
    `);
    stmt.run();
  }

  // Settings operations
  async getSettings(): Promise<Settings> {
    const stmt = this.db.prepare('SELECT * FROM settings WHERE id = 1');
    const settings = stmt.get() as Settings | undefined;
    
    // Return default if not found (should never happen due to INSERT OR IGNORE)
    return settings || { id: 1, spliceMode: "fiber" };
  }

  async updateSettings(insertSettings: InsertSettings): Promise<Settings> {
    const stmt = this.db.prepare(`
      UPDATE settings SET spliceMode = @spliceMode WHERE id = 1
    `);
    stmt.run(insertSettings);
    
    return this.getSettings();
  }

  async resetAllData(): Promise<void> {
    this.db.exec('DELETE FROM cables');
    this.db.exec('DELETE FROM circuits');
    this.db.exec('DELETE FROM splices');
  }
}
