import type { Cable, Circuit } from "@shared/schema";
import { storage } from "./storage";

type Mode = "fiber" | "copper";

type UndoSnapshot = {
  cables: Cable[];
  circuits: Circuit[];
  spliceName: string | null;
};

export type UndoEntry = {
  id: string;
  label: string;
  createdAt: string;
  snapshot: UndoSnapshot;
};

type UndoListener = () => void;

const MAX_UNDO_ENTRIES = 100;
const undoStacks: Record<Mode, UndoEntry[]> = {
  fiber: loadUndoStack("fiber"),
  copper: loadUndoStack("copper"),
};
const listeners = new Set<UndoListener>();

function getUndoStorageKey(mode: Mode) {
  return `spliceUndoStack-${mode}`;
}

function loadUndoStack(mode: Mode): UndoEntry[] {
  try {
    const stored = localStorage.getItem(getUndoStorageKey(mode));
    if (!stored) return [];
    const entries = JSON.parse(stored);
    return Array.isArray(entries) ? entries.slice(-MAX_UNDO_ENTRIES) : [];
  } catch {
    return [];
  }
}

function saveUndoStack(mode: Mode) {
  try {
    localStorage.setItem(getUndoStorageKey(mode), JSON.stringify(undoStacks[mode]));
  } catch {
    // Keep the in-memory undo stack even if localStorage quota is exhausted.
  }
}

function notifyUndoListeners() {
  listeners.forEach(listener => listener());
}

export function subscribeUndo(listener: UndoListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getUndoCount(mode: Mode) {
  return undoStacks[mode].length;
}

export function getUndoHistory(mode: Mode) {
  return [...undoStacks[mode]].reverse();
}

export async function createUndoSnapshot(mode: Mode, label: string): Promise<UndoEntry> {
  const project = await storage.getProjectSnapshot(mode);
  const entry: UndoEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    label,
    createdAt: new Date().toISOString(),
    snapshot: {
      ...project,
      spliceName: localStorage.getItem(`spliceName-${mode}`),
    },
  };

  return entry;
}

export function pushUndoSnapshot(mode: Mode, entry: UndoEntry) {
  undoStacks[mode].push(entry);
  if (undoStacks[mode].length > MAX_UNDO_ENTRIES) {
    undoStacks[mode].shift();
  }
  saveUndoStack(mode);
  notifyUndoListeners();
}

export async function undoLastChange(mode: Mode): Promise<UndoEntry | null> {
  const entry = undoStacks[mode].pop();
  if (!entry) return null;

  await storage.restoreProjectSnapshot(entry.snapshot, mode);

  if (entry.snapshot.spliceName === null) {
    localStorage.removeItem(`spliceName-${mode}`);
  } else {
    localStorage.setItem(`spliceName-${mode}`, entry.snapshot.spliceName);
  }

  saveUndoStack(mode);
  notifyUndoListeners();
  return entry;
}

export async function restoreUndoEntry(mode: Mode, entryId: string): Promise<UndoEntry | null> {
  const stack = undoStacks[mode];
  const entryIndex = stack.findIndex(entry => entry.id === entryId);
  if (entryIndex === -1) return null;

  const entry = stack[entryIndex];
  await storage.restoreProjectSnapshot(entry.snapshot, mode);

  if (entry.snapshot.spliceName === null) {
    localStorage.removeItem(`spliceName-${mode}`);
  } else {
    localStorage.setItem(`spliceName-${mode}`, entry.snapshot.spliceName);
  }

  undoStacks[mode] = stack.slice(0, entryIndex);
  saveUndoStack(mode);
  notifyUndoListeners();
  return entry;
}
