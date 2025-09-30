import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, numeric, timestamp, jsonb, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("operator"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const nodes = pgTable("nodes", {
  id: text("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id),
  region: text("region").notNull(),
  runtime: text("runtime").notNull(),
  status: text("status").notNull().default("pending"),
  reputation: numeric("reputation").default("60.0"),
  greenEnergy: boolean("green_energy").default(false),
  asnHint: text("asn_hint"),
  walletAddress: text("wallet_address"),
  lastHeartbeat: timestamp("last_heartbeat", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const nodeSecrets = pgTable("node_secrets", {
  nodeId: text("node_id").primaryKey().references(() => nodes.id),
  secret: text("secret").notNull(),
});

export const receipts = pgTable("receipts", {
  id: text("id").primaryKey(),
  nodeId: text("node_id").notNull().references(() => nodes.id),
  region: text("region").notNull(),
  modelId: text("model_id").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const earnings = pgTable("earnings", {
  id: serial("id").primaryKey(),
  nodeId: text("node_id").notNull().references(() => nodes.id),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  feesUsd: numeric("fees_usd").notNull(),
  jtvoEst: numeric("jtvo_est").notNull(),
  payoutReady: boolean("payout_ready").default(false),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertNodeSchema = createInsertSchema(nodes).pick({
  id: true,
  region: true,
  runtime: true,
  asnHint: true,
  walletAddress: true,
  greenEnergy: true,
});

export const insertReceiptSchema = createInsertSchema(receipts).pick({
  id: true,
  nodeId: true,
  region: true,
  modelId: true,
  payload: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Node = typeof nodes.$inferSelect;
export type InsertNode = z.infer<typeof insertNodeSchema>;
export type NodeSecret = typeof nodeSecrets.$inferSelect;
export type Receipt = typeof receipts.$inferSelect;
export type InsertReceipt = z.infer<typeof insertReceiptSchema>;
export type Earning = typeof earnings.$inferSelect;

// Enums
export const RuntimeEnum = z.enum(["ollama", "vllm", "tensorrtllm", "tgi"]);
export const StatusEnum = z.enum(["pending", "active", "quarantine", "offline"]);
export const RoleEnum = z.enum(["admin", "operator", "viewer"]);

// Login schema
export const loginSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
});

// Heartbeat schema
export const heartbeatSchema = z.object({
  gpuUtil: z.number().optional(),
  memUsedGb: z.number().optional(),
  p95Ms: z.number().optional(),
  ready: z.boolean(),
});

export type HeartbeatData = z.infer<typeof heartbeatSchema>;
