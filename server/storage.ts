import { nodes, nodeSecrets, receipts, earnings, users, inferenceQueue, userReceipts, type Node, type InsertNode, type NodeSecret, type Receipt, type InsertReceipt, type Earning, type User, type InsertUser, type InferenceRequest, type UserReceipt, type InsertUserReceipt } from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte } from "drizzle-orm";

export interface IStorage {
  // User operations
  createUser(user: InsertUser & { role?: string }): Promise<User>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
  
  // Node operations
  createNode(node: InsertNode & { userId?: string }): Promise<Node>;
  getNode(id: string): Promise<Node | undefined>;
  updateNodeStatus(id: string, status: string, ipAddress?: string): Promise<void>;
  updateNodeHeartbeat(id: string): Promise<void>;
  listNodes(filters?: { status?: string; region?: string; runtime?: string; userId?: string }): Promise<Node[]>;
  
  // Node secrets
  createNodeSecret(nodeId: string, secret: string): Promise<void>;
  getNodeSecret(nodeId: string): Promise<string | undefined>;
  
  // Receipts
  createReceipt(receipt: InsertReceipt): Promise<Receipt>;
  listReceipts(filters?: { nodeId?: string; limit?: number }): Promise<Receipt[]>;
  
  // Earnings
  createEarning(earning: Omit<Earning, "id">): Promise<Earning>;
  getEarning(earningId: number): Promise<Earning | undefined>;
  getEarningsByNode(nodeId: string): Promise<Earning[]>;
  getEarningsByUser(userId: string): Promise<Earning[]>;
  markPayoutReady(earningId: number, ready: boolean): Promise<void>;
  
  // Summary data
  getSummary(): Promise<{
    activeNodes: number;
    totalNodes: number;
    avgP95: number | null;
    requests24h: number;
  }>;
  
  // Inference queue operations
  createInferenceRequest(model: string, messages: any[], userId?: string): Promise<InferenceRequest>;
  getNextPendingRequest(nodeId: string): Promise<InferenceRequest | undefined>;
  updateRequestStatus(id: string, status: string, response?: string, error?: string): Promise<void>;
  getRequestById(id: string): Promise<InferenceRequest | undefined>;
  
  // User receipts operations
  createUserReceipt(receipt: InsertUserReceipt): Promise<UserReceipt>;
  getUserReceipts(userId: string, limit?: number): Promise<UserReceipt[]>;
  getLastUserReceipt(userId: string): Promise<UserReceipt | undefined>;
  getAllReceipts(limit?: number): Promise<UserReceipt[]>;
}

export class DatabaseStorage implements IStorage {
  async createUser(insertUser: InsertUser & { role?: string }): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username));
    return user || undefined;
  }

  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, id));
    return user || undefined;
  }

  async createNode(insertNode: InsertNode & { userId?: string }): Promise<Node> {
    const [node] = await db
      .insert(nodes)
      .values(insertNode)
      .returning();
    return node;
  }

  async getNode(id: string): Promise<Node | undefined> {
    const [node] = await db
      .select()
      .from(nodes)
      .where(eq(nodes.id, id));
    return node || undefined;
  }

  async updateNodeStatus(id: string, status: string, ipAddress?: string): Promise<void> {
    const updateData: any = { status, lastHeartbeat: new Date() };
    if (ipAddress) {
      updateData.ipAddress = ipAddress;
    }
    await db
      .update(nodes)
      .set(updateData)
      .where(eq(nodes.id, id));
  }

  async updateNodeHeartbeat(id: string, models?: string[]): Promise<void> {
    const updateData: any = { lastHeartbeat: new Date() };
    if (models !== undefined) {
      updateData.models = models;
    }
    await db
      .update(nodes)
      .set(updateData)
      .where(eq(nodes.id, id));
  }

  async listNodes(filters?: { status?: string; region?: string; runtime?: string; userId?: string }): Promise<Node[]> {
    const conditions = [];
    if (filters?.status) {
      conditions.push(eq(nodes.status, filters.status));
    }
    if (filters?.region) {
      conditions.push(eq(nodes.region, filters.region));
    }
    if (filters?.runtime) {
      conditions.push(eq(nodes.runtime, filters.runtime));
    }
    if (filters?.userId) {
      conditions.push(eq(nodes.userId, filters.userId));
    }
    
    if (conditions.length > 0) {
      return await db.select().from(nodes).where(and(...conditions)).orderBy(desc(nodes.lastHeartbeat));
    }
    
    return await db.select().from(nodes).orderBy(desc(nodes.lastHeartbeat));
  }

  async createNodeSecret(nodeId: string, secret: string): Promise<void> {
    await db
      .insert(nodeSecrets)
      .values({ nodeId, secret })
      .onConflictDoUpdate({
        target: nodeSecrets.nodeId,
        set: { secret }
      });
  }

  async getNodeSecret(nodeId: string): Promise<string | undefined> {
    const [secret] = await db
      .select()
      .from(nodeSecrets)
      .where(eq(nodeSecrets.nodeId, nodeId));
    return secret?.secret;
  }

  async createReceipt(insertReceipt: InsertReceipt): Promise<Receipt> {
    const [receipt] = await db
      .insert(receipts)
      .values(insertReceipt)
      .returning();
    return receipt;
  }

  async listReceipts(filters?: { nodeId?: string; limit?: number }): Promise<Receipt[]> {
    if (filters?.nodeId) {
      if (filters.limit) {
        return await db.select().from(receipts).where(eq(receipts.nodeId, filters.nodeId)).orderBy(desc(receipts.createdAt)).limit(filters.limit);
      }
      return await db.select().from(receipts).where(eq(receipts.nodeId, filters.nodeId)).orderBy(desc(receipts.createdAt));
    }
    
    if (filters?.limit) {
      return await db.select().from(receipts).orderBy(desc(receipts.createdAt)).limit(filters.limit);
    }
    
    return await db.select().from(receipts).orderBy(desc(receipts.createdAt));
  }

  async getSummary(): Promise<{
    activeNodes: number;
    totalNodes: number;
    avgP95: number | null;
    requests24h: number;
  }> {
    const totalNodes = await db.$count(nodes);
    const activeNodes = await db.$count(nodes, eq(nodes.status, "active"));
    
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentReceipts = await db
      .select()
      .from(receipts)
      .where(gte(receipts.createdAt, twentyFourHoursAgo));
    
    const requests24h = recentReceipts.length;
    
    // Calculate average P95 from recent receipts
    let avgP95 = null;
    if (recentReceipts.length > 0) {
      const p95Values = recentReceipts
        .map(r => r.payload as any)
        .filter(p => p?.p95_ms)
        .map(p => p.p95_ms);
      
      if (p95Values.length > 0) {
        avgP95 = Math.round(p95Values.reduce((a, b) => a + b, 0) / p95Values.length);
      }
    }
    
    return {
      activeNodes,
      totalNodes,
      avgP95,
      requests24h
    };
  }

  async createEarning(earning: Omit<Earning, "id">): Promise<Earning> {
    const [result] = await db
      .insert(earnings)
      .values(earning)
      .returning();
    return result;
  }

  async getEarning(earningId: number): Promise<Earning | undefined> {
    const [earning] = await db
      .select()
      .from(earnings)
      .where(eq(earnings.id, earningId));
    return earning || undefined;
  }

  async getEarningsByNode(nodeId: string): Promise<Earning[]> {
    return await db
      .select()
      .from(earnings)
      .where(eq(earnings.nodeId, nodeId))
      .orderBy(desc(earnings.periodEnd));
  }

  async getEarningsByUser(userId: string): Promise<Earning[]> {
    const userNodes = await db
      .select()
      .from(nodes)
      .where(eq(nodes.userId, userId));
    
    if (userNodes.length === 0) {
      return [];
    }
    
    const nodeIds = userNodes.map(n => n.id);
    const results = [];
    
    for (const nodeId of nodeIds) {
      const nodeEarnings = await db
        .select()
        .from(earnings)
        .where(eq(earnings.nodeId, nodeId))
        .orderBy(desc(earnings.periodEnd));
      results.push(...nodeEarnings);
    }
    
    return results;
  }

  async markPayoutReady(earningId: number, ready: boolean): Promise<void> {
    await db
      .update(earnings)
      .set({ payoutReady: ready })
      .where(eq(earnings.id, earningId));
  }
  
  async createInferenceRequest(model: string, messages: any[], userId?: string): Promise<InferenceRequest> {
    const [request] = await db
      .insert(inferenceQueue)
      .values({
        model,
        messages,
        status: "pending",
        userId
      })
      .returning();
    return request;
  }
  
  async getNextPendingRequest(nodeId: string): Promise<InferenceRequest | undefined> {
    // Get pending requests for models this node has
    const node = await this.getNode(nodeId);
    if (!node || !node.models || node.models.length === 0) {
      return undefined;
    }
    
    // Find oldest pending request for models this node supports
    const pendingRequests = await db
      .select()
      .from(inferenceQueue)
      .where(eq(inferenceQueue.status, "pending"))
      .orderBy(inferenceQueue.createdAt);
    
    // Find first request that matches node's models
    for (const request of pendingRequests) {
      if (node.models.includes(request.model)) {
        // Mark it as processing and assign to this node
        await db
          .update(inferenceQueue)
          .set({
            status: "processing",
            nodeId: nodeId,
            updatedAt: new Date()
          })
          .where(eq(inferenceQueue.id, request.id));
        
        return request;
      }
    }
    
    return undefined;
  }
  
  async updateRequestStatus(id: string, status: string, response?: string, error?: string): Promise<void> {
    const updateData: any = {
      status,
      updatedAt: new Date()
    };
    
    if (response !== undefined) {
      updateData.response = response;
    }
    
    if (error !== undefined) {
      updateData.error = error;
    }
    
    await db
      .update(inferenceQueue)
      .set(updateData)
      .where(eq(inferenceQueue.id, id));
  }
  
  async getRequestById(id: string): Promise<InferenceRequest | undefined> {
    const [request] = await db
      .select()
      .from(inferenceQueue)
      .where(eq(inferenceQueue.id, id));
    return request || undefined;
  }
  
  async createUserReceipt(receipt: InsertUserReceipt): Promise<UserReceipt> {
    const [userReceipt] = await db
      .insert(userReceipts)
      .values(receipt)
      .returning();
    return userReceipt;
  }
  
  async getUserReceipts(userId: string, limit?: number): Promise<UserReceipt[]> {
    const query = db
      .select()
      .from(userReceipts)
      .where(eq(userReceipts.userId, userId))
      .orderBy(desc(userReceipts.blockNumber));
    
    if (limit) {
      return await query.limit(limit);
    }
    return await query;
  }
  
  async getLastUserReceipt(userId: string): Promise<UserReceipt | undefined> {
    const [receipt] = await db
      .select()
      .from(userReceipts)
      .where(eq(userReceipts.userId, userId))
      .orderBy(desc(userReceipts.blockNumber))
      .limit(1);
    return receipt || undefined;
  }
  
  async getAllReceipts(limit?: number): Promise<UserReceipt[]> {
    const query = db
      .select()
      .from(userReceipts)
      .orderBy(desc(userReceipts.blockNumber));
    
    if (limit) {
      return await query.limit(limit);
    }
    return await query;
  }
}

export const storage = new DatabaseStorage();
