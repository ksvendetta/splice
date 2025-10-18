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

// Cable table
export const cables = pgTable("cables", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  fiberCount: integer("fiber_count").notNull(),
  ribbonSize: integer("ribbon_size").notNull().default(12),
  type: text("type").notNull(),
});

// Circuits table - represents circuit IDs and fiber assignments within a cable
export const circuits = pgTable("circuits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cableId: varchar("cable_id").notNull(),
  circuitId: text("circuit_id").notNull(),
  fiberStart: integer("fiber_start").notNull(),
  fiberEnd: integer("fiber_end").notNull(),
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

// Insert schemas
export const insertCableSchema = createInsertSchema(cables).omit({ id: true });
export const insertCircuitSchema = createInsertSchema(circuits).omit({ id: true }).refine(
  (data) => data.fiberStart <= data.fiberEnd,
  {
    message: "Start fiber must be less than or equal to end fiber",
    path: ["fiberEnd"],
  }
);
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

// Types
export type InsertCable = z.infer<typeof insertCableSchema>;
export type Cable = typeof cables.$inferSelect;
export type InsertCircuit = z.infer<typeof insertCircuitSchema>;
export type Circuit = typeof circuits.$inferSelect;
export type InsertSplice = z.infer<typeof insertSpliceSchema>;
export type Splice = typeof splices.$inferSelect;

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
