import type { Express, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { requireNodeAuth, generateNodeSecret } from "./security";
import { insertNodeSchema, heartbeatSchema, insertReceiptSchema, RuntimeEnum, StatusEnum, loginSchema } from "@shared/schema";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { ReceiptGenerator } from "./receiptGenerator";
import { geolocationService } from "./services/geolocation";
import { agentManager } from "./services/AgentConnectionManager";
import fs from "fs";
import path from "path";

const registerSchema = insertNodeSchema.extend({
  runtime: RuntimeEnum,
});

const nodeFiltersSchema = z.object({
  status: StatusEnum.optional(),
  region: z.string().optional(),
  runtime: RuntimeEnum.optional(),
});

const earningsCalculateSchema = z.object({
  nodeId: z.string().min(1),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
}).refine(data => data.periodEnd > data.periodStart, {
  message: "periodEnd must be after periodStart",
});

const payoutUpdateSchema = z.object({
  ready: z.boolean(),
});

// Authentication middleware
function requireAuth(req: any, res: any, next: any) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

// Role-based authorization middleware
function requireRole(...allowedRoles: string[]) {
  return (req: any, res: any, next: any) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (!allowedRoles.includes(req.session.role || "")) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

// Job streaming state management
type JobState = {
  committedOffset: number;   // Authoritative offset
  transcript: string;        // Authoritative full text (response)
  reasoning: string;         // Authoritative reasoning text
  seenSeq: Set<number>;      // Dedup
  clients: Set<WebSocket>;   // WS subscribers
};
const jobStates = new Map<string, JobState>();

// Helper function for UTF-8 safe slicing by codepoints
function sliceByOffset(transcript: string, from: number, to: number): string {
  const arr = [...transcript]; // Convert to codepoints
  return arr.slice(from, to).join('');
}

export async function registerRoutes(app: Express, sessionParser: RequestHandler): Promise<Server> {
  // Auth routes
  app.post("/api/v1/auth/register", async (req, res) => {
    try {
      const data = loginSchema.parse(req.body);
      
      // Check if user exists
      const existingUser = await storage.getUserByUsername(data.username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }
      
      // Hash password
      const hashedPassword = await bcrypt.hash(data.password, 10);
      
      // Create user with operator role by default
      const user = await storage.createUser({
        username: data.username,
        password: hashedPassword,
        role: "operator",
      });
      
      // Regenerate session to prevent session fixation
      req.session.regenerate((err) => {
        if (err) {
          return res.status(500).json({ error: "Session error" });
        }
        
        req.session.userId = user.id;
        req.session.role = user.role;
        
        res.json({
          id: user.id,
          username: user.username,
          role: user.role,
        });
      });
    } catch (error) {
      console.error("Register error:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Registration failed" });
      }
    }
  });

  app.post("/api/v1/auth/login", async (req, res) => {
    try {
      const data = loginSchema.parse(req.body);
      
      // Find user
      const user = await storage.getUserByUsername(data.username);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      // Verify password
      const valid = await bcrypt.compare(data.password, user.password);
      if (!valid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      // Regenerate session to prevent session fixation
      req.session.regenerate((err) => {
        if (err) {
          return res.status(500).json({ error: "Session error" });
        }
        
        req.session.userId = user.id;
        req.session.role = user.role;
        
        res.json({
          id: user.id,
          username: user.username,
          role: user.role,
        });
      });
    } catch (error) {
      console.error("Login error:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Login failed" });
      }
    }
  });

  app.post("/api/v1/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      res.clearCookie("dgon.sid");
      res.json({ success: true });
    });
  });

  app.get("/api/v1/auth/me", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUserById(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json({
        id: user.id,
        username: user.username,
        role: user.role,
      });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ error: "Failed to get user" });
    }
  });

  // Public summary endpoint
  app.get("/api/v1/summary", async (req, res) => {
    try {
      await storage.endStaleNodeSessions(120);
      const summary = await storage.getSummary();
      res.json(summary);
    } catch (error) {
      console.error("Summary error:", error);
      res.status(500).json({ error: "Failed to get summary" });
    }
  });

  // Serve agent script for download
  app.get("/agent.py", (req, res) => {
    try {
      const agentPath = path.join(process.cwd(), "agent.py");
      const agentContent = fs.readFileSync(agentPath, "utf-8");
      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Content-Disposition", "attachment; filename=agent.py");
      res.send(agentContent);
    } catch (error) {
      console.error("Error serving agent script:", error);
      res.status(404).json({ error: "Agent script not found" });
    }
  });

  // Public node self-registration (no auth required for initial registration)
  app.post("/api/v1/nodes/self-register", async (req, res) => {
    try {
      const data = insertNodeSchema.parse(req.body);
      
      // Check if node already exists
      const existingNode = await storage.getNode(data.id);
      if (existingNode) {
        return res.status(400).json({ error: "Node already registered" });
      }
      
      // Generate node secret
      const nodeSecret = generateNodeSecret();
      
      // Create node
      await storage.createNode(data);
      
      // Store the secret
      await storage.createNodeSecret(data.id, nodeSecret);
      
      res.json({
        nodeId: data.id,
        token: nodeSecret,
        message: "Node registered successfully",
      });
    } catch (error) {
      console.error("Registration error:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid request data", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to register node" });
      }
    }
  });
  
  // Node registration (requires admin or operator role)
  app.post("/api/v1/nodes/register", requireRole("admin", "operator"), async (req, res) => {
    try {
      const data = registerSchema.parse(req.body);
      const userId = req.session.userId!;
      
      // Create or update node
      const existingNode = await storage.getNode(data.id);
      let node;
      
      if (existingNode) {
        // Update existing node - only owner or admin can do this
        if (existingNode.userId !== userId && req.session.role !== "admin") {
          return res.status(403).json({ error: "Cannot modify this node" });
        }
        await storage.updateNodeStatus(data.id, "pending");
        node = { ...existingNode, ...data, status: "pending" };
      } else {
        // Create new node and link to user
        node = await storage.createNode({ ...data, userId });
      }

      // Generate and store secret
      const secret = generateNodeSecret();
      await storage.createNodeSecret(data.id, secret);

      res.json({
        status: "registered",
        nodeId: data.id,
        nodeToken: secret,
      });
    } catch (error) {
      console.error("Registration error:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Registration failed" });
      }
    }
  });

  // Node heartbeat (requires HMAC auth)
  app.post(
    "/api/v1/nodes/heartbeat",
    requireNodeAuth((nodeId) => storage.getNodeSecret(nodeId)),
    async (req, res) => {
      try {
        const data = heartbeatSchema.parse(req.body);
        const nodeId = req.nodeId!;

        const node = await storage.getNode(nodeId);
        if (!node) {
          return res.status(404).json({ error: "Node not found" });
        }

        // Get node's IP address from request (take first IP if multiple)
        let ipAddress = req.headers['x-forwarded-for'] as string || 
                       req.socket.remoteAddress || 
                       'unknown';
        
        // If x-forwarded-for contains multiple IPs, take the first one
        if (ipAddress.includes(',')) {
          ipAddress = ipAddress.split(',')[0].trim();
        }
        
        // Remove IPv6 prefix if present
        if (ipAddress.startsWith('::ffff:')) {
          ipAddress = ipAddress.substring(7);
        }

        // Update status based on readiness and update models list
        const newStatus = data.ready ? "active" : "pending";
        const previousStatus = node.status;
        
        await storage.updateNodeStatus(nodeId, newStatus, ipAddress);
        await storage.updateNodeHeartbeat(nodeId, data.models || [], data.hardware, data.location);
        
        // Lookup geolocation if we have an IP and no location yet
        if (ipAddress && !node.city && !node.country) {
          const location = await geolocationService.lookupIp(ipAddress);
          if (location) {
            await storage.updateNodeLocation(
              nodeId, 
              location.city, 
              location.country, 
              location.latitude, 
              location.longitude
            );
          }
        }
        
        // Re-fetch node to get latest state after updates (handles race with stale cleanup)
        const updatedNode = await storage.getNode(nodeId);
        if (!updatedNode) {
          return res.status(404).json({ error: "Node not found after update" });
        }
        
        // Start session if node is active but has no active session
        if (newStatus === "active" && !updatedNode.onlineSince) {
          await storage.startNodeSession(nodeId);
        }
        
        // End session when node goes from active to another status
        if (previousStatus === "active" && newStatus !== "active" && updatedNode.onlineSince) {
          await storage.endNodeSession(nodeId);
        }
        
        // Update uptime for active nodes with active sessions
        if (newStatus === "active" && updatedNode.onlineSince) {
          await storage.updateNodeUptime(nodeId);
        }

        res.json({ status: newStatus, models: data.models || [] });
      } catch (error) {
        console.error("Heartbeat error:", error);
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: error.errors });
        } else {
          res.status(500).json({ error: "Heartbeat failed" });
        }
      }
    }
  );

  // Receipt ingestion (requires HMAC auth)
  app.post(
    "/api/v1/receipts",
    requireNodeAuth((nodeId) => storage.getNodeSecret(nodeId)),
    async (req, res) => {
      try {
        const data = insertReceiptSchema.parse(req.body);
        
        // Verify nodeId matches authenticated node
        if (data.nodeId !== req.nodeId) {
          return res.status(403).json({ error: "Node ID mismatch" });
        }

        const receipt = await storage.createReceipt(data);
        res.json({ id: receipt.id });
      } catch (error) {
        console.error("Receipt error:", error);
        if (error instanceof z.ZodError) {
          res.status(400).json({ error: error.errors });
        } else {
          res.status(500).json({ error: "Receipt failed" });
        }
      }
    }
  );

  // List nodes (dashboard) - requires auth with RBAC
  app.get("/api/v1/nodes", requireAuth, async (req, res) => {
    try {
      const filters = nodeFiltersSchema.parse(req.query);
      const role = req.session.role;
      
      // Apply role-based filtering
      // Note: userId filtering would need to be added to storage layer
      // For now, admins and viewers see all nodes, operators see all nodes
      
      const nodes = await storage.listNodes(filters);
      // Convert reputation to number
      const serializedNodes = nodes.map(node => ({
        ...node,
        reputation: node.reputation ? parseFloat(node.reputation as any) : 60
      }));
      res.json(serializedNodes);
    } catch (error) {
      console.error("List nodes error:", error);
      res.status(500).json({ error: "Failed to list nodes" });
    }
  });

  // Get node details - requires auth with RBAC
  app.get("/api/v1/nodes/:id", requireAuth, async (req, res) => {
    try {
      const node = await storage.getNode(req.params.id);
      if (!node) {
        return res.status(404).json({ error: "Node not found" });
      }
      
      // Check permissions
      const role = req.session.role;
      const userId = req.session.userId;
      if (role === "operator" && node.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Convert reputation to number
      const serializedNode = {
        ...node,
        reputation: node.reputation ? parseFloat(node.reputation as any) : 60
      };
      res.json(serializedNode);
    } catch (error) {
      console.error("Get node error:", error);
      res.status(500).json({ error: "Failed to get node" });
    }
  });

  // Get node sessions (uptime history) - requires auth with RBAC
  app.get("/api/v1/nodes/:id/sessions", requireAuth, async (req, res) => {
    try {
      const node = await storage.getNode(req.params.id);
      if (!node) {
        return res.status(404).json({ error: "Node not found" });
      }
      
      // Check permissions
      const role = req.session.role;
      const userId = req.session.userId;
      if (role === "operator" && node.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const sessions = await storage.getNodeSessions(req.params.id, limit);
      
      res.json(sessions);
    } catch (error) {
      console.error("Get sessions error:", error);
      res.status(500).json({ error: "Failed to get sessions" });
    }
  });

  // Earnings endpoints
  app.get("/api/v1/earnings", requireAuth, async (req, res) => {
    try {
      const role = req.session.role;
      const userId = req.session.userId!;
      
      let allEarnings: any[] = [];
      
      if (role === "operator") {
        // Operators see their own earnings
        allEarnings = await storage.getEarningsByUser(userId);
      } else {
        // Admins and viewers see all earnings (get from all nodes)
        const allNodes = await storage.listNodes({});
        for (const node of allNodes) {
          const nodeEarnings = await storage.getEarningsByNode(node.id);
          allEarnings.push(...nodeEarnings);
        }
      }
      
      // Convert numeric fields to numbers
      const serialized = allEarnings.map(e => ({
        ...e,
        feesUsd: parseFloat(e.feesUsd as any),
        jtvoEst: parseFloat(e.jtvoEst as any),
      }));
      
      res.json(serialized);
    } catch (error) {
      console.error("List earnings error:", error);
      res.status(500).json({ error: "Failed to list earnings" });
    }
  });

  app.post("/api/v1/earnings/calculate", requireRole("admin", "operator"), async (req, res) => {
    try {
      const data = earningsCalculateSchema.parse(req.body);
      const { nodeId, periodStart, periodEnd } = data;
      
      // Verify the node exists and user has permission
      const node = await storage.getNode(nodeId);
      if (!node) {
        return res.status(404).json({ error: "Node not found" });
      }
      
      const role = req.session.role;
      const userId = req.session.userId!;
      
      if (role === "operator" && node.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Check for existing earnings in this period (idempotency)
      const existingEarnings = await storage.getEarningsByNode(nodeId);
      const duplicate = existingEarnings.find(e => 
        e.periodStart.getTime() === periodStart.getTime() && 
        e.periodEnd.getTime() === periodEnd.getTime()
      );
      
      if (duplicate) {
        return res.status(409).json({ 
          error: "Earnings already calculated for this period",
          existing: {
            ...duplicate,
            feesUsd: parseFloat(duplicate.feesUsd as any),
            jtvoEst: parseFloat(duplicate.jtvoEst as any),
          }
        });
      }
      
      // Get receipts in the period
      const receipts = await storage.listReceipts({ nodeId });
      const periodReceipts = receipts.filter(r => {
        if (!r.createdAt) return false;
        const createdAt = new Date(r.createdAt);
        return createdAt >= periodStart && createdAt <= periodEnd;
      });
      
      // Calculate earnings (simple example: $0.01 per request)
      const requestCount = periodReceipts.length;
      const feesUsd = requestCount * 0.01;
      
      // JTVO estimation (example: 1 JTVO per $0.10)
      const jtvoEst = feesUsd * 10;
      
      // Create earning record
      const earning = await storage.createEarning({
        nodeId,
        periodStart,
        periodEnd,
        feesUsd: feesUsd.toString(),
        jtvoEst: jtvoEst.toString(),
        payoutReady: false,
      });
      
      res.json({
        ...earning,
        feesUsd: parseFloat(earning.feesUsd as any),
        jtvoEst: parseFloat(earning.jtvoEst as any),
      });
    } catch (error) {
      console.error("Calculate earnings error:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to calculate earnings" });
      }
    }
  });

  app.patch("/api/v1/earnings/:id/payout", requireRole("admin"), async (req, res) => {
    try {
      const earningId = z.coerce.number().positive().parse(req.params.id);
      const { ready } = payoutUpdateSchema.parse(req.body);
      
      // Verify the earning exists
      const earning = await storage.getEarning(earningId);
      if (!earning) {
        return res.status(404).json({ error: "Earning not found" });
      }
      
      await storage.markPayoutReady(earningId, ready);
      res.json({ success: true });
    } catch (error) {
      console.error("Mark payout error:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update payout status" });
      }
    }
  });

  // Get node metrics (latency percentiles, etc.)
  app.get("/api/v1/nodes/:id/metrics", requireAuth, async (req, res) => {
    try {
      const nodeId = req.params.id;
      const timeWindow = (req.query.window as string) || "24h";
      
      // Verify the node exists
      const node = await storage.getNode(nodeId);
      if (!node) {
        return res.status(404).json({ error: "Node not found" });
      }
      
      // Check RBAC permissions
      const role = req.session.role;
      const userId = req.session.userId!;
      
      if (role === "operator" && node.userId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Get receipts for this node
      const allReceipts = await storage.listReceipts({ nodeId });
      
      // Filter by time window
      const now = Date.now();
      const timeWindowMs = {
        "1h": 60 * 60 * 1000,
        "24h": 24 * 60 * 60 * 1000,
        "7d": 7 * 24 * 60 * 60 * 1000,
        "30d": 30 * 24 * 60 * 60 * 1000,
      }[timeWindow] || 24 * 60 * 60 * 1000;
      
      const receipts = allReceipts.filter(r => {
        if (!r.createdAt) return false;
        const receiptTime = new Date(r.createdAt).getTime();
        return (now - receiptTime) <= timeWindowMs;
      });
      
      if (receipts.length === 0) {
        return res.json({
          nodeId,
          timeWindow,
          requestCount: 0,
          latency: null,
          tokens: null,
          cacheHitRate: 0,
        });
      }
      
      // Extract latency values (p95_ms from payload)
      const latencies = receipts
        .map(r => (r.payload as any)?.p95_ms)
        .filter(l => typeof l === "number" && !isNaN(l))
        .sort((a, b) => a - b);
      
      // Calculate percentiles
      const percentile = (arr: number[], p: number) => {
        if (arr.length === 0) return 0;
        const index = Math.ceil((p / 100) * arr.length) - 1;
        return arr[Math.max(0, index)];
      };
      
      // Calculate token stats
      const tokenStats = receipts.reduce((acc, r) => {
        const payload = r.payload as any;
        return {
          input: acc.input + (payload?.tokens_input || 0),
          output: acc.output + (payload?.tokens_output || 0),
        };
      }, { input: 0, output: 0 });
      
      // Calculate cache hit rate
      const cacheHits = receipts.filter(r => (r.payload as any)?.cache_hit === true).length;
      const cacheHitRate = receipts.length > 0 ? (cacheHits / receipts.length) * 100 : 0;
      
      res.json({
        nodeId,
        timeWindow,
        requestCount: receipts.length,
        latency: latencies.length > 0 ? {
          p50: percentile(latencies, 50),
          p95: percentile(latencies, 95),
          p99: percentile(latencies, 99),
          min: Math.min(...latencies),
          max: Math.max(...latencies),
          avg: latencies.reduce((a, b) => a + b, 0) / latencies.length,
        } : null,
        tokens: {
          totalInput: tokenStats.input,
          totalOutput: tokenStats.output,
          avgInput: Math.round(tokenStats.input / receipts.length),
          avgOutput: Math.round(tokenStats.output / receipts.length),
        },
        cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      });
    } catch (error) {
      console.error("Get node metrics error:", error);
      res.status(500).json({ error: "Failed to get node metrics" });
    }
  });

  // Get available models from active nodes (public endpoint)
  app.get("/api/v1/models", async (req, res) => {
    try {
      const activeNodes = await storage.listNodes({ status: "active" });
      const modelsMap = new Map<string, { id: string; deviceType: string | null; city: string | null; country: string | null; hardwareMetadata: any }[]>();
      
      // Filter out nodes that haven't sent heartbeat in last 60 seconds
      // (increased from 30s to handle inference processing time)
      const now = new Date();
      const sixtySecondsAgo = new Date(now.getTime() - 60000);
      
      console.log(`[Models] Checking ${activeNodes.length} active nodes at ${now.toISOString()}`);
      
      activeNodes.forEach(node => {
        const lastHeartbeat = node.lastHeartbeat ? new Date(node.lastHeartbeat) : null;
        const isOnline = lastHeartbeat && lastHeartbeat >= sixtySecondsAgo;
        
        console.log(`[Models] Node ${node.id}: lastHeartbeat=${lastHeartbeat?.toISOString() || 'never'}, isOnline=${isOnline}, models=${node.models?.join(',') || 'none'}`);
        
        // Skip nodes that are offline (no heartbeat in last 60 seconds)
        if (!isOnline) {
          return;
        }
        
        const nodeInfo = {
          id: node.id,
          deviceType: node.deviceType,
          city: node.city,
          country: node.country,
          hardwareMetadata: node.hardwareMetadata
        };
        
        const models = node.models || [];
        models.forEach(model => {
          if (!modelsMap.has(model)) {
            modelsMap.set(model, []);
          }
          modelsMap.get(model)!.push(nodeInfo);
        });
      });
      
      const availableModels = Array.from(modelsMap.entries()).map(([model, nodeInfos]) => ({
        model,
        nodeCount: nodeInfos.length,
        nodes: nodeInfos.map(n => n.id),
        nodeDetails: nodeInfos
      }));
      
      console.log(`[Models] Returning ${availableModels.length} models:`, availableModels.map(m => `${m.model}(${m.nodeCount})`).join(', '));
      
      res.json({ models: availableModels });
    } catch (error) {
      console.error("Models fetch error:", error);
      res.status(500).json({ error: "Failed to fetch models" });
    }
  });

  // Inference routing endpoint - Queue-based system (public endpoint)
  app.post("/api/v1/inference/chat", requireAuth, async (req, res) => {
    try {
      const { model, messages } = req.body;
      const userId = req.session.userId!;
      
      if (!model || !messages) {
        return res.status(400).json({ error: "Model and messages required" });
      }
      
      // Check if any nodes have this model and are online
      const activeNodes = await storage.listNodes({ status: "active" });
      const now = new Date();
      const thirtySecondsAgo = new Date(now.getTime() - 30000);
      
      const availableNodes = activeNodes.filter(node => 
        node.models && 
        node.models.includes(model) &&
        node.lastHeartbeat && 
        new Date(node.lastHeartbeat) >= thirtySecondsAgo
      );
      
      if (availableNodes.length === 0) {
        return res.status(404).json({ error: "No nodes available with this model" });
      }
      
      // Create inference request in queue with user ID
      const request = await storage.createInferenceRequest(model, messages, userId);
      
      // Return request ID for frontend to poll
      res.json({
        requestId: request.id,
        status: "pending"
      });
      
    } catch (error) {
      console.error("Inference routing error:", error);
      res.status(500).json({ error: "Failed to route inference request" });
    }
  });

  // Get inference request status - for frontend polling
  app.get("/api/v1/inference/status/:id", async (req, res) => {
    try {
      const request = await storage.getRequestById(req.params.id);
      
      if (!request) {
        return res.status(404).json({ error: "Request not found" });
      }
      
      res.json({
        requestId: request.id,
        status: request.status,
        response: request.response || "",
        nodeId: request.nodeId,
        error: request.error,
        done: request.status === "completed" || request.status === "failed"
      });
      
    } catch (error) {
      console.error("Status check error:", error);
      res.status(500).json({ error: "Failed to get request status" });
    }
  });
  
  // HTTP polling with delta contract - same as WebSocket
  app.get("/api/v1/inference/delta", (req, res) => {
    const jobId = req.query.jobId as string;
    const since = Number(req.query.since || 0);
    
    if (!jobId) {
      return res.status(400).json({ error: "jobId required" });
    }
    
    const jobState = jobStates.get(jobId);
    if (!jobState) {
      return res.status(404).json({ error: "unknown_job" });
    }
    
    // If client is caught up, return 204 No Content
    if (since >= jobState.committedOffset) {
      return res.status(204).end();
    }
    
    // Return delta from client's offset
    const delta = sliceByOffset(jobState.transcript, since, jobState.committedOffset);
    res.json({ 
      jobId, 
      offset: since, 
      delta, 
      done: false  // Will be set to true in a separate final frame
    });
  });
  
  // Node polling endpoint - Get next inference request
  app.get(
    "/api/v1/inference/poll",
    requireNodeAuth((nodeId) => storage.getNodeSecret(nodeId)),
    async (req, res) => {
      try {
        const nodeId = req.nodeId!;
        
        // Get next pending request for this node
        const request = await storage.getNextPendingRequest(nodeId);
        
        if (!request) {
          return res.status(404).json({ message: "No pending requests" });
        }
        
        res.json({
          id: request.id,
          model: request.model,
          messages: request.messages
        });
        
      } catch (error) {
        console.error("Polling error:", error);
        res.status(500).json({ error: "Failed to poll for requests" });
      }
    }
  );
  
  // Node completion endpoint - Submit inference result
  app.post(
    "/api/v1/inference/complete",
    requireNodeAuth((nodeId) => storage.getNodeSecret(nodeId)),
    async (req, res) => {
      try {
        const { id, status, response, error } = req.body;
        const nodeId = req.nodeId!;
        
        if (!id || !status) {
          return res.status(400).json({ error: "ID and status required" });
        }
        
        await storage.updateRequestStatus(id, status, response, error);
        
        // Emit job completion/error event for SSE streaming (HTTP polling path)
        if (status === "completed") {
          agentManager.emit('job:complete', { jobId: id, agentId: nodeId });
        } else if (status === "failed") {
          agentManager.emit('job:error', { jobId: id, error: error || "Request failed", agentId: nodeId });
        }
        
        // If task completed successfully, generate a receipt
        if (status === "completed" && response) {
          const request = await storage.getRequestById(id);
          if (request && request.userId) {
            const startTime = new Date(request.createdAt!).getTime();
            const endTime = new Date().getTime();
            const processingTime = endTime - startTime;
            
            // Estimate token count (rough approximation)
            const tokenCount = Math.ceil(response.length / 4);
            
            await ReceiptGenerator.createReceipt(
              request.userId,
              id,
              nodeId,
              request.model,
              request.messages as any[],
              response,
              processingTime,
              tokenCount
            );
          }
        }
        
        res.json({ success: true });
        
      } catch (error) {
        console.error("Completion error:", error);
        res.status(500).json({ error: "Failed to complete request" });
      }
    }
  );

  // Node streaming endpoint - Submit streaming chunks with offset tracking
  app.post(
    "/api/v1/inference/stream",
    requireNodeAuth((nodeId) => storage.getNodeSecret(nodeId)),
    async (req, res) => {
      try {
        const { id: jobId, seq, offset, delta, cumulative, done, contentType } = req.body;
        const nodeId = req.nodeId!;
        const type = contentType || "response"; // Default to response for backwards compatibility
        
        if (!jobId) {
          return res.status(400).json({ error: "Request ID required" });
        }
        
        // Get or create job state
        let jobState = jobStates.get(jobId);
        if (!jobState) {
          jobState = {
            committedOffset: 0,
            transcript: "",
            reasoning: "",
            seenSeq: new Set(),
            clients: new Set()
          };
          jobStates.set(jobId, jobState);
        }
        
        // Update node's lastHeartbeat since it's actively streaming (keeps it "online")
        await storage.updateNodeHeartbeat(nodeId);
        
        // Handle idempotency for sequence numbers
        if (seq !== undefined && jobState.seenSeq.has(seq)) {
          return res.status(200).json({ ok: true, offset: jobState.committedOffset });
        }
        
        // Compute delta from cumulative if agent sends cumulative (backwards compatibility)
        let actualDelta = delta;
        if (!delta && cumulative) {
          // Agent is sending cumulative text, compute the delta
          actualDelta = cumulative.slice(jobState.committedOffset);
        }
        
        // For compatibility, if neither delta nor cumulative but chunk exists
        if (!actualDelta && req.body.chunk) {
          actualDelta = req.body.chunk;
        }
        
        // Validate offset if provided
        if (offset !== undefined && offset !== jobState.committedOffset) {
          return res.status(409).json({ 
            error: "offset_mismatch", 
            expected: jobState.committedOffset 
          });
        }
        
        // Apply delta to appropriate field
        if (actualDelta) {
          if (type === "reasoning") {
            jobState.reasoning += actualDelta;
          } else {
            jobState.transcript += actualDelta;
          }
          jobState.committedOffset += [...actualDelta].length; // Codepoint-safe
          
          // IMPORTANT: Emit token event for SSE streaming (HTTP polling path)
          // This allows SSE endpoint to receive tokens from HTTP polling agents
          // just like it receives tokens from WebSocket agents
          agentManager.emit('token', {
            jobId,
            token: type === "reasoning" ? "" : actualDelta,
            reasoning: type === "reasoning" ? actualDelta : undefined,
            done: !!done,
            agentId: nodeId
          });
        }
        
        // Track sequence if provided
        if (seq !== undefined) {
          jobState.seenSeq.add(seq);
        }
        
        // Update database with full transcript
        const request = await storage.getRequestById(jobId);
        if (request) {
          await storage.updateRequestStatus(
            jobId,
            done ? "completed" : "streaming",
            jobState.transcript
          );
        }
        
        // Fan-out delta to all WebSocket clients (not cumulative!)
        const frame = JSON.stringify({ 
          jobId, 
          offset: offset ?? jobState.committedOffset - [...actualDelta].length,
          delta: actualDelta, 
          contentType: type,
          done: !!done 
        });
        
        // Send to all WebSocket clients watching this job
        jobState.clients.forEach(ws => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(frame);
          }
        });
        
        // Also send to request-specific connection for backwards compatibility
        const requestConnections = (app as any).wsConnections as Map<string, WebSocket>;
        const requestWs = requestConnections.get(jobId);
        if (requestWs && requestWs.readyState === WebSocket.OPEN) {
          requestWs.send(JSON.stringify({
            type: "chunk",
            requestId: jobId,
            chunk: actualDelta,  // Send delta, not cumulative!
            contentType: type,
            done
          }));
        }
        
        // Clean up when done
        if (done) {
          // Generate receipt
          if (request && request.userId) {
            const startTime = new Date(request.createdAt!).getTime();
            const endTime = new Date().getTime();
            const processingTime = endTime - startTime;
            const tokenCount = Math.ceil(jobState.transcript.length / 4);
            
            await ReceiptGenerator.createReceipt(
              request.userId,
              jobId,
              nodeId,
              request.model,
              request.messages as any[],
              jobState.transcript,
              processingTime,
              tokenCount
            );
          }
          
          // Clean up job state after a delay (allow late clients to catch up)
          setTimeout(() => {
            jobStates.delete(jobId);
          }, 60000); // Keep for 1 minute
        }
        
        res.json({ ok: true, offset: jobState.committedOffset });
        
      } catch (error) {
        console.error("Streaming error:", error);
        res.status(500).json({ error: "Failed to process stream" });
      }
    }
  );

  // User receipts endpoints
  app.get("/api/v1/user/receipts", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const limit = parseInt((req.query.limit as string) || "50");
      
      const receipts = await storage.getUserReceipts(userId, limit);
      
      // Verify the blockchain integrity for this user
      const chainValid = await ReceiptGenerator.verifyReceiptChain(userId);
      
      res.json({
        receipts,
        chainValid,
        totalReceipts: receipts.length
      });
    } catch (error) {
      console.error("List user receipts error:", error);
      res.status(500).json({ error: "Failed to list receipts" });
    }
  });
  
  // Get all receipts - admin only
  app.get("/api/v1/admin/receipts", requireRole("admin"), async (req, res) => {
    try {
      const limit = parseInt((req.query.limit as string) || "100");
      
      const receipts = await storage.getAllReceipts(limit);
      
      res.json({
        receipts,
        totalReceipts: receipts.length
      });
    } catch (error) {
      console.error("List all receipts error:", error);
      res.status(500).json({ error: "Failed to list all receipts" });
    }
  });
  
  // Verify receipt chain integrity for a user
  app.get("/api/v1/user/receipts/verify", requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const chainValid = await ReceiptGenerator.verifyReceiptChain(userId);
      
      res.json({
        userId,
        chainValid,
        message: chainValid ? "Receipt chain is valid" : "Receipt chain integrity compromised"
      });
    } catch (error) {
      console.error("Verify chain error:", error);
      res.status(500).json({ error: "Failed to verify receipt chain" });
    }
  });
  
  // List receipts - requires auth with RBAC
  app.get("/api/v1/receipts", requireAuth, async (req, res) => {
    try {
      let nodeId = req.query.nodeId as string;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const role = req.session.role;
      const userId = req.session.userId;
      
      // For operators, only show receipts from their own nodes
      if (role === "operator") {
        if (nodeId) {
          // Verify they own the specified node
          const node = await storage.getNode(nodeId);
          if (!node || node.userId !== userId) {
            return res.status(403).json({ error: "Access denied" });
          }
        } else {
          // Get all their nodes and filter receipts
          const userNodes = await storage.listNodes({ userId });
          if (userNodes.length === 0) {
            return res.json([]);
          }
          // For now, if they don't specify a node, return empty
          // TODO: extend storage to support filtering receipts by multiple nodeIds
          return res.json([]);
        }
      }
      
      const receipts = await storage.listReceipts({ nodeId, limit });
      res.json(receipts);
    } catch (error) {
      console.error("List receipts error:", error);
      res.status(500).json({ error: "Failed to list receipts" });
    }
  });

  // SSE Streaming endpoint - Event-driven streaming (no polling!)
  // Tokens flow: Agent WebSocket → Event → SSE → Browser (instant!)
  app.post("/api/v1/chat/stream", requireAuth, async (req, res) => {
    const { model, messages, options } = req.body;
    const userId = req.session.userId!;
    
    if (!model || !messages) {
      return res.status(400).json({ error: "Model and messages required" });
    }
    
    // Check if any nodes have this model and are online
    const activeNodes = await storage.listNodes({ status: "active" });
    const now = new Date();
    const sixtySecondsAgo = new Date(now.getTime() - 60000);
    
    const availableNodes = activeNodes.filter(node => 
      node.models && 
      node.models.includes(model) &&
      node.lastHeartbeat && 
      new Date(node.lastHeartbeat) >= sixtySecondsAgo
    );
    
    if (availableNodes.length === 0) {
      return res.status(404).json({ error: "No nodes available with this model" });
    }
    
    // Create inference request
    const request = await storage.createInferenceRequest(model, messages, userId);
    const jobId = request.id;
    
    // Initialize job state before attempting to push
    let jobState = jobStates.get(jobId);
    if (!jobState) {
      jobState = {
        committedOffset: 0,
        transcript: "",
        reasoning: "",
        seenSeq: new Set(),
        clients: new Set()
      };
      jobStates.set(jobId, jobState);
    }
    
    // Set SSE headers BEFORE submitting job
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();
    
    // Send initial event with job ID
    res.write(`data: ${JSON.stringify({ type: 'started', jobId })}\n\n`);
    
    let isComplete = false;
    let cleanup: (() => void) | null = null;
    
    // EVENT-DRIVEN: Listen for tokens from AgentConnectionManager (WebSocket path)
    // This is INSTANT - no polling delay!
    const onToken = (event: { jobId: string; token: string; done: boolean; agentId: string; reasoning?: string; serverReceiveTs?: number; agentTs?: number }) => {
      if (event.jobId !== jobId || isComplete) return;
      
      const sseSendTs = Date.now();
      const serverToSseLatency = event.serverReceiveTs ? sseSendTs - event.serverReceiveTs : 0;
      const totalLatency = event.agentTs ? sseSendTs - event.agentTs : 0;
      
      // Send reasoning delta immediately
      if (event.reasoning) {
        const payload = JSON.stringify({ 
          type: 'delta', 
          contentType: 'reasoning',
          delta: event.reasoning,
          timing: { agentTs: event.agentTs, serverTs: event.serverReceiveTs, sseTs: sseSendTs, totalMs: totalLatency }
        });
        console.log(`[TIMING] SSE send reasoning: totalLatency=${totalLatency}ms serverToSse=${serverToSseLatency}ms`);
        res.write(`data: ${payload}\n\n`);
      }
      
      // Send response token immediately
      if (event.token) {
        const payload = JSON.stringify({ 
          type: 'delta', 
          contentType: 'response',
          delta: event.token,
          timing: { agentTs: event.agentTs, serverTs: event.serverReceiveTs, sseTs: sseSendTs, totalMs: totalLatency }
        });
        console.log(`[TIMING] SSE send token: totalLatency=${totalLatency}ms serverToSse=${serverToSseLatency}ms chars=${event.token.length}`);
        res.write(`data: ${payload}\n\n`);
      }
    };
    
    const onJobComplete = (event: { jobId: string; agentId: string }) => {
      if (event.jobId !== jobId || isComplete) return;
      isComplete = true;
      
      res.write(`data: ${JSON.stringify({ type: 'done', nodeId: event.agentId })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      
      if (cleanup) cleanup();
    };
    
    const onJobError = (event: { jobId: string; error: string; agentId: string }) => {
      if (event.jobId !== jobId || isComplete) return;
      isComplete = true;
      
      res.write(`data: ${JSON.stringify({ type: 'error', error: event.error })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      
      if (cleanup) cleanup();
    };
    
    // Subscribe to AgentConnectionManager events (WebSocket path - instant!)
    agentManager.on('token', onToken);
    agentManager.on('job:complete', onJobComplete);
    agentManager.on('job:error', onJobError);
    
    cleanup = () => {
      agentManager.off('token', onToken);
      agentManager.off('job:complete', onJobComplete);
      agentManager.off('job:error', onJobError);
    };
    
    // Try to push job to a WebSocket-connected agent (instant delivery)
    const { submitted, agentId } = agentManager.submitJob({
      jobId,
      model,
      messages,
      options
    });
    
    if (submitted) {
      console.log(`Job ${jobId} pushed to agent ${agentId} via WebSocket (instant streaming)`);
    } else {
      console.log(`No WebSocket agents available, job ${jobId} queued for HTTP polling`);
      
      // FALLBACK: For HTTP polling agents, we still need to poll jobStates
      // This only runs when no WebSocket agents are available
      const checkInterval = setInterval(() => {
        if (isComplete) {
          clearInterval(checkInterval);
          return;
        }
        
        const state = jobStates.get(jobId);
        if (!state) return;
        
        // Check for new content from HTTP polling agents
        // (WebSocket tokens bypass this entirely)
      }, 10);
      
      // Watch for completion from HTTP polling agents
      const completionCheck = setInterval(async () => {
        if (isComplete) {
          clearInterval(completionCheck);
          clearInterval(checkInterval);
          return;
        }
        
        try {
          const dbRequest = await storage.getRequestById(jobId);
          if (dbRequest && (dbRequest.status === 'completed' || dbRequest.status === 'failed')) {
            isComplete = true;
            clearInterval(checkInterval);
            clearInterval(completionCheck);
            
            // Send any remaining content from job state
            const state = jobStates.get(jobId);
            if (state) {
              if (state.transcript) {
                res.write(`data: ${JSON.stringify({ 
                  type: 'delta', 
                  contentType: 'response',
                  delta: state.transcript
                })}\n\n`);
              }
              if (state.reasoning) {
                res.write(`data: ${JSON.stringify({ 
                  type: 'delta', 
                  contentType: 'reasoning',
                  delta: state.reasoning
                })}\n\n`);
              }
            }
            
            if (dbRequest.status === 'failed') {
              res.write(`data: ${JSON.stringify({ type: 'error', error: dbRequest.error || 'Request failed' })}\n\n`);
            } else {
              res.write(`data: ${JSON.stringify({ type: 'done', nodeId: dbRequest.nodeId })}\n\n`);
            }
            res.write('data: [DONE]\n\n');
            res.end();
            
            if (cleanup) cleanup();
          }
        } catch (error) {
          console.error('SSE completion check error:', error);
        }
      }, 50);
      
      // Store these for cleanup
      req.on('close', () => {
        clearInterval(checkInterval);
        clearInterval(completionCheck);
      });
    }
    
    // Timeout after 5 minutes
    const timeout = setTimeout(() => {
      if (isComplete) return;
      isComplete = true;
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Request timeout' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      if (cleanup) cleanup();
    }, 5 * 60 * 1000);
    
    // Clean up on client disconnect
    req.on('close', () => {
      isComplete = true;
      clearTimeout(timeout);
      if (cleanup) cleanup();
    });
  });

  const httpServer = createServer(app);
  
  // Create WebSocket server for real-time streaming (noServer mode)
  const wss = new WebSocketServer({ noServer: true });
  
  // Store frontend WebSocket connections by session ID only
  const sessionConnections = new Map<string, WebSocket>();
  
  // Store request ID to WebSocket mapping for precise chunk delivery
  const requestConnections = new Map<string, WebSocket>();
  
  // Handle WebSocket upgrade manually
  httpServer.on('upgrade', (request, socket, head) => {
    // Only handle WebSocket connections for our /api/ws path
    if (!request.url?.startsWith('/api/ws')) {
      // Let other WebSocket connections (like Vite HMR) pass through
      return;
    }
    
    // Create a minimal response stub for session parser
    const resStub = {
      getHeader: () => undefined,
      setHeader: () => {},
      headersSent: false,
      writeHead: () => {},
      end: () => {}
    };
    
    // Parse session from cookie
    sessionParser(request as any, resStub as any, () => {
      // Require authentication for frontend WebSocket connections
      const url = new URL(request.url || "", `http://${request.headers.host}`);
      const isAgentConnection = url.searchParams.has("nodeId") && url.searchParams.has("token");
      
      if (!isAgentConnection && !(request as any).session?.userId) {
        // Reject unauthenticated WebSocket connections
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    });
  });
  
  // WebSocket connection handler
  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const sessionId = url.searchParams.get("session");
    const nodeId = url.searchParams.get("nodeId");
    const nodeToken = url.searchParams.get("token");
    const jobId = url.searchParams.get("jobId");
    const since = Number(url.searchParams.get("since") || 0);
    
    // Agent connection (for bidirectional WebSocket streaming)
    if (nodeId && nodeToken) {
      console.log(`Agent WebSocket connected: ${nodeId}`);
      
      // Register agent with the connection manager (handles job push and token streaming)
      agentManager.registerAgent(nodeId, ws, []);
      
      ws.on("message", async (data) => {
        try {
          const message = JSON.parse(data.toString());
          
          // Handle token streaming and other messages via the manager
          if (message.type === "token" || message.type === "job_complete" || message.type === "job_error" || message.type === "heartbeat" || message.type === "status") {
            agentManager.handleAgentMessage(nodeId, message);
          }
          
          // Also update job state for SSE delivery
          if (message.type === "token") {
            const state = jobStates.get(message.jobId);
            if (state) {
              if (message.reasoning) {
                state.reasoning += message.reasoning;
              }
              if (message.token) {
                state.transcript += message.token;
                state.committedOffset = [...state.transcript].length;
              }
            }
          }
          
          // Handle job completion - mark in storage so SSE loop can terminate
          if (message.type === "job_complete") {
            const jobId = message.jobId;
            const state = jobStates.get(jobId);
            const response = state?.transcript || "";
            console.log(`Job ${jobId} completed via WebSocket (${response.length} chars)`);
            
            // Mark the inference request as complete in storage
            storage.updateRequestStatus(jobId, "completed", response).catch((err: Error) => {
              console.error(`Failed to mark job ${jobId} as complete:`, err);
            });
          }
          
          // Handle job errors
          if (message.type === "job_error") {
            const jobId = message.jobId;
            console.error(`Job ${jobId} failed via WebSocket:`, message.error);
            
            // Mark the inference request as failed in storage
            storage.updateRequestStatus(jobId, "failed", undefined, message.error).catch((err: Error) => {
              console.error(`Failed to mark job ${jobId} as failed:`, err);
            });
          }
        } catch (error) {
          console.error("Agent WebSocket message error:", error);
        }
      });
      
      ws.on("close", () => {
        agentManager.removeAgent(nodeId);
      });
      
      return;
    }
    
    // Frontend connection with job subscription (new delta mode)
    if (jobId) {
      let jobState = jobStates.get(jobId);
      if (!jobState) {
        // Create new job state if it doesn't exist
        jobState = {
          committedOffset: 0,
          transcript: "",
          reasoning: "",
          seenSeq: new Set<number>(),
          clients: new Set<WebSocket>()
        };
        jobStates.set(jobId, jobState);
      }
      
      // Add this client to the job's subscriber list
      jobState.clients.add(ws);
      
      // If client is behind, send the backlog as a single delta
      if (since < jobState.committedOffset) {
        const backlog = sliceByOffset(jobState.transcript, since, jobState.committedOffset);
        ws.send(JSON.stringify({ 
          jobId, 
          offset: since, 
          delta: backlog, 
          done: false 
        }));
      }
      
      const currentJobState = jobState; // Capture for closure
      ws.on("close", () => {
        currentJobState.clients.delete(ws);
      });
      
      return;
    }
    
    // Legacy frontend connection (for receiving inference responses)
    if (!sessionId) {
      ws.close(1008, "Session ID required");
      return;
    }
    
    console.log(`Frontend WebSocket connected: ${sessionId}`);
    sessionConnections.set(sessionId, ws);
    
    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === "inference_request") {
          // Extract userId from session
          const userId = (req as any).session?.userId;
          
          // Ensure user is authenticated
          if (!userId) {
            ws.send(JSON.stringify({ 
              type: "error", 
              error: "Authentication required" 
            }));
            ws.close(1008, "Authentication required");
            return;
          }
          
          // Create inference request with userId
          const request = await storage.createInferenceRequest(
            message.model,
            message.messages,
            userId
          );
          
          // Send request ID back to client
          ws.send(JSON.stringify({
            type: "request_created",
            requestId: request.id
          }));
          
          // Map this specific request to THIS WebSocket connection only
          requestConnections.set(request.id, ws);
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
        ws.send(JSON.stringify({ type: "error", error: String(error) }));
      }
    });
    
    ws.on("close", () => {
      console.log(`WebSocket disconnected: ${sessionId}`);
      sessionConnections.delete(sessionId);
      
      // Clean up all request mappings for this connection
      for (const [requestId, conn] of requestConnections.entries()) {
        if (conn === ws) {
          requestConnections.delete(requestId);
        }
      }
    });
    
    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
  });
  
  // Export request connections for use in HTTP streaming endpoint
  (app as any).wsConnections = requestConnections;
  
  return httpServer;
}
