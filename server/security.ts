import { createHmac, timingSafeEqual, randomBytes } from "crypto";
import { Request, Response, NextFunction } from "express";

export interface AuthHeaders {
  nodeId: string;
  timestamp: string;
  signature: string;
}

export function extractAuthHeaders(req: Request): AuthHeaders | null {
  const nodeId = req.headers["x-node-id"] as string;
  const timestamp = req.headers["x-node-ts"] as string;
  const signature = req.headers["x-node-auth"] as string;

  if (!nodeId || !timestamp || !signature) {
    return null;
  }

  return { nodeId, timestamp, signature };
}

export function verifyHmacSignature(
  secret: string,
  body: Buffer,
  timestamp: string,
  signature: string
): boolean {
  // Check timestamp freshness (within 2 minutes)
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp);
  if (Math.abs(now - ts) > 120) {
    return false;
  }

  // Create HMAC
  const message = Buffer.concat([body, Buffer.from(timestamp)]);
  const expectedSignature = createHmac("sha256", secret)
    .update(message)
    .digest("hex");

  // Timing-safe comparison
  try {
    return timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
  } catch {
    return false;
  }
}

export function generateNodeSecret(): string {
  return randomBytes(32).toString("hex");
}

export function requireNodeAuth(getSecret: (nodeId: string) => Promise<string | undefined>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeaders = extractAuthHeaders(req);
      if (!authHeaders) {
        return res.status(401).json({ error: "Missing authentication headers" });
      }

      const secret = await getSecret(authHeaders.nodeId);
      if (!secret) {
        return res.status(401).json({ error: "Unknown node" });
      }

      const body = req.rawBody as Buffer || Buffer.from("");
      const isValid = verifyHmacSignature(
        secret,
        body,
        authHeaders.timestamp,
        authHeaders.signature
      );

      if (!isValid) {
        return res.status(401).json({ error: "Invalid signature" });
      }

      req.nodeId = authHeaders.nodeId;
      next();
    } catch (error) {
      res.status(500).json({ error: "Authentication error" });
    }
  };
}

// Extend Request type
declare global {
  namespace Express {
    interface Request {
      nodeId?: string;
    }
  }
}
