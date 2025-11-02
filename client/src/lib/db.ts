import Dexie, { type Table } from 'dexie';
import type { Cable, Circuit, Save, Log } from '@/../../shared/schema';

// IndexedDB Database
class FiberSpliceDB extends Dexie {
  cables!: Table<Cable>;
  circuits!: Table<Circuit>;
  saves!: Table<Save>;
  logs!: Table<Log>;

  constructor() {
    super('FiberSpliceDB');
    this.version(2).stores({
      cables: 'id, name, type',
      circuits: 'id, cableId, position, isSpliced',
      saves: 'id, createdAt'
    });
    // Version 3: Add logs table
    this.version(3).stores({
      cables: 'id, name, type',
      circuits: 'id, cableId, position, isSpliced',
      saves: 'id, createdAt',
      logs: 'id, timestamp, level, category'
    });
  }
}

export const db = new FiberSpliceDB();
