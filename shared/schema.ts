import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Fiber color type matching standard fiber optic color codes
export const fiberColors = [
  "blue",
  "orange", 
  "green",
  "brown",
  "slate",
  "white",
  "red",
  "black",
  "yellow",
  "violet",
  "pink",
  "aqua"
] as const;

export type FiberColor = typeof fiberColors[number];

// Cable types
export const cableTypes = ["Feed", "Distribution"] as const;
export type CableType = typeof cableTypes[number];

// Cable table
export const cables = pgTable("cables", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  fiberCount: integer("fiber_count").notNull(),
  ribbonSize: integer("ribbon_size").notNull().default(12), // Always 12, not exposed in UI
  type: text("type").notNull(),
});

// Circuits table - represents circuit IDs and fiber assignments within a cable
// fiberStart and fiberEnd are auto-calculated based on circuit order
export const circuits = pgTable("circuits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cableId: varchar("cable_id").notNull(),
  circuitId: text("circuit_id").notNull(),
  position: integer("position").notNull(), // Order in the cable (0-indexed)
  fiberStart: integer("fiber_start").notNull(), // Auto-calculated
  fiberEnd: integer("fiber_end").notNull(), // Auto-calculated
  isSpliced: integer("is_spliced").notNull().default(0), // 0 = not spliced, 1 = spliced
  feedCableId: varchar("feed_cable_id"), // For Distribution cables: which Feed cable this maps to
  feedFiberStart: integer("feed_fiber_start"), // Which fiber in feed cable (start)
  feedFiberEnd: integer("feed_fiber_end"), // Which fiber in feed cable (end)
});

// Splice table - represents a connection between fibers of two cables
export const splices = pgTable("splices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceCableId: varchar("source_cable_id").notNull(),
  destinationCableId: varchar("destination_cable_id").notNull(),
  sourceRibbon: integer("source_ribbon").notNull(),
  sourceStartFiber: integer("source_start_fiber").notNull(),
  sourceEndFiber: integer("source_end_fiber").notNull(),
  destinationRibbon: integer("destination_ribbon").notNull(),
  destinationStartFiber: integer("destination_start_fiber").notNull(),
  destinationEndFiber: integer("destination_end_fiber").notNull(),
  ponStart: integer("pon_start"),
  ponEnd: integer("pon_end"),
  isCompleted: integer("is_completed").notNull().default(0),
});

// Saves table - stores project snapshots with date/time stamped names
export const saves = pgTable("saves", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // Date/time stamp (e.g., "2025-10-18 20:15:30")
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  data: text("data").notNull(), // JSON string containing cables and circuits
});

// Logs table - debug logging for troubleshooting
export const logs = pgTable("logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  timestamp: text("timestamp").notNull(),
  level: text("level").notNull(), // 'info', 'warning', 'error'
  category: text("category").notNull(), // 'cable', 'circuit', 'ocr', 'file', 'system'
  message: text("message").notNull(),
  data: text("data"), // Optional JSON data for context
});

// Insert schemas
export const insertCableSchema = createInsertSchema(cables).omit({ 
  id: true,
  ribbonSize: true, // Always default to 12
}).extend({
  type: z.enum(cableTypes),
  circuitIds: z.array(z.string()).optional(), // Circuit IDs to create with cable
});
export const insertCircuitSchema = createInsertSchema(circuits).omit({ 
  id: true,
  position: true, // Auto-calculated
  fiberStart: true, // Auto-calculated
  fiberEnd: true, // Auto-calculated
  isSpliced: true, // Defaults to 0
  feedCableId: true, // Set when toggling splice status
});
export const insertSpliceSchema = createInsertSchema(splices).omit({ id: true }).refine(
  (data) => data.sourceStartFiber <= data.sourceEndFiber,
  {
    message: "Source start fiber must be less than or equal to end fiber",
    path: ["sourceEndFiber"],
  }
).refine(
  (data) => data.destinationStartFiber <= data.destinationEndFiber,
  {
    message: "Destination start fiber must be less than or equal to end fiber",
    path: ["destinationEndFiber"],
  }
).refine(
  (data) => {
    const sourceCount = data.sourceEndFiber - data.sourceStartFiber + 1;
    const destCount = data.destinationEndFiber - data.destinationStartFiber + 1;
    return sourceCount === destCount;
  },
  {
    message: "Source and destination fiber ranges must be equal in size",
    path: ["destinationEndFiber"],
  }
);
export const insertSaveSchema = createInsertSchema(saves).omit({ 
  id: true, 
  createdAt: true 
});
export const insertLogSchema = createInsertSchema(logs).omit({ 
  id: true,
  timestamp: true
});

// Types
export type InsertCable = z.infer<typeof insertCableSchema>;
export type Cable = typeof cables.$inferSelect;
export type InsertCircuit = z.infer<typeof insertCircuitSchema>;
export type Circuit = typeof circuits.$inferSelect;
export type InsertSplice = z.infer<typeof insertSpliceSchema>;
export type Splice = typeof splices.$inferSelect;
export type InsertSave = z.infer<typeof insertSaveSchema>;
export type Save = typeof saves.$inferSelect;
export type InsertLog = z.infer<typeof insertLogSchema>;
export type Log = typeof logs.$inferSelect;

// Helper function to get fiber color by index (0-11 for standard 12-fiber ribbon)
export function getFiberColor(fiberIndex: number): FiberColor {
  return fiberColors[fiberIndex % 12];
}

// Helper to get ribbon number for a given fiber (1-indexed)
export function getRibbonNumber(fiberNumber: number, ribbonSize: number = 12): number {
  return Math.ceil(fiberNumber / ribbonSize);
}

// Helper to get position within ribbon (0-11)
export function getFiberPositionInRibbon(fiberNumber: number, ribbonSize: number = 12): number {
  return ((fiberNumber - 1) % ribbonSize);
}

// Helper to parse circuit ID and extract fiber count
// Examples: "lg,33-36" = 4 fibers, "b,1-2" = 2 fibers, "ks,219-228" = 10 fibers
export function parseCircuitId(circuitId: string): number {
  const match = circuitId.match(/(\d+)-(\d+)$/);
  if (!match) {
    throw new Error(`Invalid circuit ID format: ${circuitId}`);
  }
  const start = parseInt(match[1], 10);
  const end = parseInt(match[2], 10);
  return end - start + 1;
}

// Helper to extract prefix and range from circuit ID
// Examples: "pon,1-8" => { prefix: "pon", rangeStart: 1, rangeEnd: 8 }
export function parseCircuitIdParts(circuitId: string): { prefix: string; rangeStart: number; rangeEnd: number } {
  const parts = circuitId.split(',');
  if (parts.length !== 2) {
    throw new Error(`Invalid circuit ID format: ${circuitId}`);
  }
  const prefix = parts[0].trim();
  const rangeMatch = parts[1].trim().match(/^(\d+)-(\d+)$/);
  if (!rangeMatch) {
    throw new Error(`Invalid circuit ID range format: ${circuitId}`);
  }
  return {
    prefix,
    rangeStart: parseInt(rangeMatch[1], 10),
    rangeEnd: parseInt(rangeMatch[2], 10),
  };
}

// Helper to check if two circuit IDs overlap
// Two circuits overlap if they have the same prefix AND their ranges overlap
// Examples: "pon,1-8" and "pon,8-12" overlap (both include 8)
//           "pon,1-8" and "pon,9-12" do NOT overlap
//           "pon,1-8" and "lg,1-8" do NOT overlap (different prefix)
export function circuitIdsOverlap(circuitId1: string, circuitId2: string): boolean {
  try {
    const parts1 = parseCircuitIdParts(circuitId1);
    const parts2 = parseCircuitIdParts(circuitId2);
    
    // Different prefixes = no overlap
    if (parts1.prefix !== parts2.prefix) {
      return false;
    }
    
    // Check if ranges overlap: range1 overlaps range2 if start1 <= end2 AND start2 <= end1
    return parts1.rangeStart <= parts2.rangeEnd && parts2.rangeStart <= parts1.rangeEnd;
  } catch {
    return false;
  }
}
