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
  models: text().array().default(sql`ARRAY[]::text[]`),
  ipAddress: text("ip_address"),
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

export const inferenceQueue = pgTable("inference_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nodeId: text("node_id").references(() => nodes.id),
  userId: varchar("user_id").references(() => users.id),
  model: text("model").notNull(),
  messages: jsonb("messages").notNull(),
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  response: text("response"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const userReceipts = pgTable("user_receipts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  inferenceId: varchar("inference_id").notNull().references(() => inferenceQueue.id),
  nodeId: text("node_id").references(() => nodes.id),
  model: text("model").notNull(),
  requestHash: text("request_hash").notNull(), // Hash of the request
  responseHash: text("response_hash").notNull(), // Hash of the response
  previousHash: text("previous_hash"), // Link to previous receipt (blockchain style)
  blockHash: text("block_hash").notNull(), // Combined hash of all fields
  blockNumber: serial("block_number"), // Sequential block number
  status: text("status").notNull().default("delivered"), // delivered, failed
  processingTime: numeric("processing_time"), // Time in ms
  tokenCount: numeric("token_count"), // Number of tokens generated
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
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

export const registerSchema = insertNodeSchema;

export const insertReceiptSchema = createInsertSchema(receipts).pick({
  id: true,
  nodeId: true,
  region: true,
  modelId: true,
  payload: true,
});

export const insertUserReceiptSchema = createInsertSchema(userReceipts).omit({
  id: true,
  blockNumber: true,
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Node = typeof nodes.$inferSelect;
export type InsertNode = z.infer<typeof insertNodeSchema>;
export type NodeSecret = typeof nodeSecrets.$inferSelect;
export type Receipt = typeof receipts.$inferSelect;
export type InsertReceipt = z.infer<typeof insertReceiptSchema>;
export type UserReceipt = typeof userReceipts.$inferSelect;
export type InsertUserReceipt = z.infer<typeof insertUserReceiptSchema>;
export type Earning = typeof earnings.$inferSelect;
export type InferenceRequest = typeof inferenceQueue.$inferSelect;

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
  models: z.array(z.string()).optional().default([]),
});

export type HeartbeatData = z.infer<typeof heartbeatSchema>;
