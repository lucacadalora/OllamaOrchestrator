import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { requireNodeAuth, generateNodeSecret } from "./security";
import { insertNodeSchema, heartbeatSchema, insertReceiptSchema, RuntimeEnum, StatusEnum } from "@shared/schema";
import { z } from "zod";

const registerSchema = insertNodeSchema.extend({
  runtime: RuntimeEnum,
});

const nodeFiltersSchema = z.object({
  status: StatusEnum.optional(),
  region: z.string().optional(),
  runtime: RuntimeEnum.optional(),
});

export async function registerRoutes(app: Express): Promise<Server> {
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

  // Node registration (admin/bootstrap)
  app.post("/api/v1/nodes/register", async (req, res) => {
    try {
      const data = registerSchema.parse(req.body);
      
      // Create or update node
      const existingNode = await storage.getNode(data.id);
      let node;
      
      if (existingNode) {
        // Update existing node
        await storage.updateNodeStatus(data.id, "pending");
        node = { ...existingNode, ...data, status: "pending" };
      } else {
        // Create new node
        node = await storage.createNode(data);
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

        // Update status based on readiness
        const newStatus = data.ready ? "active" : "pending";
        await storage.updateNodeStatus(nodeId, newStatus);

        res.json({ status: newStatus });
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

  // List nodes (dashboard)
  app.get("/api/v1/nodes", async (req, res) => {
    try {
      const filters = nodeFiltersSchema.parse(req.query);
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

  // Get node details
  app.get("/api/v1/nodes/:id", async (req, res) => {
    try {
      const node = await storage.getNode(req.params.id);
      if (!node) {
        return res.status(404).json({ error: "Node not found" });
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

  // List receipts
  app.get("/api/v1/receipts", async (req, res) => {
    try {
      const nodeId = req.query.nodeId as string;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      
      const receipts = await storage.listReceipts({ nodeId, limit });
      res.json(receipts);
    } catch (error) {
      console.error("List receipts error:", error);
      res.status(500).json({ error: "Failed to list receipts" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
