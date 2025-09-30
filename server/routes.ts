import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { requireNodeAuth, generateNodeSecret } from "./security";
import { insertNodeSchema, heartbeatSchema, insertReceiptSchema, RuntimeEnum, StatusEnum, loginSchema } from "@shared/schema";
import { z } from "zod";
import bcrypt from "bcryptjs";
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

export async function registerRoutes(app: Express): Promise<Server> {
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
      const summary = await storage.getSummary();
      res.json(summary);
    } catch (error) {
      console.error("Summary error:", error);
      res.status(500).json({ error: "Failed to get summary" });
    }
  });

  // Serve agent script for download
  app.get("/agent_mac_dev.py", (req, res) => {
    try {
      const agentPath = path.join(process.cwd(), "agent_mac_dev.py");
      const agentContent = fs.readFileSync(agentPath, "utf-8");
      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Content-Disposition", "attachment; filename=agent_mac_dev.py");
      res.send(agentContent);
    } catch (error) {
      console.error("Error serving agent script:", error);
      res.status(404).json({ error: "Agent script not found" });
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
        await storage.updateNodeStatus(nodeId, newStatus, ipAddress);
        await storage.updateNodeHeartbeat(nodeId, data.models || []);

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
      const modelsMap = new Map<string, string[]>();
      
      // Filter out nodes that haven't sent heartbeat in last 30 seconds
      const now = new Date();
      const thirtySecondsAgo = new Date(now.getTime() - 30000);
      
      console.log(`[Models] Checking ${activeNodes.length} active nodes at ${now.toISOString()}`);
      
      activeNodes.forEach(node => {
        const lastHeartbeat = node.lastHeartbeat ? new Date(node.lastHeartbeat) : null;
        const isOnline = lastHeartbeat && lastHeartbeat >= thirtySecondsAgo;
        
        console.log(`[Models] Node ${node.id}: lastHeartbeat=${lastHeartbeat?.toISOString() || 'never'}, isOnline=${isOnline}, models=${node.models?.join(',') || 'none'}`);
        
        // Skip nodes that are offline (no heartbeat in last 30 seconds)
        if (!isOnline) {
          return;
        }
        
        const models = node.models || [];
        models.forEach(model => {
          if (!modelsMap.has(model)) {
            modelsMap.set(model, []);
          }
          modelsMap.get(model)!.push(node.id);
        });
      });
      
      const availableModels = Array.from(modelsMap.entries()).map(([model, nodeIds]) => ({
        model,
        nodeCount: nodeIds.length,
        nodes: nodeIds
      }));
      
      console.log(`[Models] Returning ${availableModels.length} models:`, availableModels.map(m => `${m.model}(${m.nodeCount})`).join(', '));
      
      res.json({ models: availableModels });
    } catch (error) {
      console.error("Models fetch error:", error);
      res.status(500).json({ error: "Failed to fetch models" });
    }
  });

  // Inference routing endpoint - Queue-based system (public endpoint)
  app.post("/api/v1/inference/chat", async (req, res) => {
    try {
      const { model, messages } = req.body;
      
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
      
      // Create inference request in queue and return immediately
      const request = await storage.createInferenceRequest(model, messages);
      
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
        
        if (!id || !status) {
          return res.status(400).json({ error: "ID and status required" });
        }
        
        await storage.updateRequestStatus(id, status, response, error);
        res.json({ success: true });
        
      } catch (error) {
        console.error("Completion error:", error);
        res.status(500).json({ error: "Failed to complete request" });
      }
    }
  );

  // Node streaming endpoint - Submit streaming chunks
  app.post(
    "/api/v1/inference/stream",
    requireNodeAuth((nodeId) => storage.getNodeSecret(nodeId)),
    async (req, res) => {
      try {
        const { id, chunk, done } = req.body;
        
        if (!id) {
          return res.status(400).json({ error: "Request ID required" });
        }
        
        // Store chunk in request (append to existing response)
        const request = await storage.getRequestById(id);
        if (request) {
          const currentResponse = request.response || "";
          const newResponse = currentResponse + chunk;
          await storage.updateRequestStatus(
            id, 
            done ? "completed" : "streaming",
            newResponse
          );
          
          // Send via WebSocket if connection exists for instant streaming
          const wsConnections = (app as any).wsConnections as Map<string, WebSocket>;
          const ws = wsConnections.get(id);
          
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: "stream_chunk",
              requestId: id,
              chunk,
              response: newResponse,
              done
            }));
          }
        }
        
        res.json({ success: true });
        
      } catch (error) {
        console.error("Streaming error:", error);
        res.status(500).json({ error: "Failed to process stream" });
      }
    }
  );

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

  const httpServer = createServer(app);
  
  // Create WebSocket server for real-time streaming
  const wss = new WebSocketServer({ server: httpServer });
  
  // Store active WebSocket connections
  const activeConnections = new Map<string, WebSocket>();
  
  // WebSocket connection handler
  wss.on("connection", (ws, req) => {
    // Only handle WebSocket connections for /api/ws path
    if (!req.url?.startsWith("/api/ws")) {
      return;
    }
    
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const sessionId = url.searchParams.get("session");
    
    if (!sessionId) {
      ws.close(1008, "Session ID required");
      return;
    }
    
    console.log(`WebSocket connected: ${sessionId}`);
    activeConnections.set(sessionId, ws);
    
    ws.on("message", async (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === "inference_request") {
          // Create inference request
          const request = await storage.createInferenceRequest(
            message.model,
            message.messages
          );
          
          // Send request ID back to client
          ws.send(JSON.stringify({
            type: "request_created",
            requestId: request.id
          }));
          
          // Store WebSocket connection for this request
          activeConnections.set(request.id, ws);
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
        ws.send(JSON.stringify({ type: "error", error: String(error) }));
      }
    });
    
    ws.on("close", () => {
      console.log(`WebSocket disconnected: ${sessionId}`);
      activeConnections.delete(sessionId);
      // Clean up any request-specific connections
      for (const [key, conn] of activeConnections.entries()) {
        if (conn === ws) {
          activeConnections.delete(key);
        }
      }
    });
    
    ws.on("error", (error) => {
      console.error("WebSocket error:", error);
    });
  });
  
  // Export WebSocket connections for use in other endpoints
  (app as any).wsConnections = activeConnections;
  
  return httpServer;
}
