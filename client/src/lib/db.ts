import Dexie, { type Table } from 'dexie';
import type { Cable, Circuit, Save } from '@/../../shared/schema';

// IndexedDB Database
class FiberSpliceDB extends Dexie {
  cables!: Table<Cable>;
  circuits!: Table<Circuit>;
  saves!: Table<Save>;

  constructor() {
    super('FiberSpliceDB');
    this.version(2).stores({
      cables: 'id, name, type',
      circuits: 'id, cableId, position, isSpliced',
      saves: 'id, createdAt'
    });
  }
}

export const db = new FiberSpliceDB();
