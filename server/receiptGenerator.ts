import { createHash } from "crypto";
import { storage } from "./storage";
import type { InsertUserReceipt } from "@shared/schema";

export class ReceiptGenerator {
  /**
   * Generate SHA-256 hash of a string
   */
  private static hash(data: string): string {
    return createHash("sha256").update(data).digest("hex");
  }

  /**
   * Generate a hash for the request payload
   */
  static generateRequestHash(messages: any[]): string {
    const requestData = JSON.stringify(messages);
    return this.hash(requestData);
  }

  /**
   * Generate a hash for the response
   */
  static generateResponseHash(response: string): string {
    return this.hash(response);
  }

  /**
   * Generate a block hash combining all receipt data
   */
  static generateBlockHash(
    userId: string,
    inferenceId: string,
    requestHash: string,
    responseHash: string,
    previousHash: string | null,
    timestamp: Date
  ): string {
    const blockData = [
      userId,
      inferenceId,
      requestHash,
      responseHash,
      previousHash || "genesis",
      timestamp.toISOString()
    ].join(":");
    
    return this.hash(blockData);
  }

  /**
   * Create a receipt for a completed inference request
   */
  static async createReceipt(
    userId: string,
    inferenceId: string,
    nodeId: string | null,
    model: string,
    messages: any[],
    response: string,
    processingTime: number,
    tokenCount?: number
  ): Promise<void> {
    try {
      // Get the previous receipt for this user to maintain the chain
      const lastReceipt = await storage.getLastUserReceipt(userId);
      
      // Generate hashes
      const requestHash = this.generateRequestHash(messages);
      const responseHash = this.generateResponseHash(response);
      const previousHash = lastReceipt?.blockHash || null;
      const timestamp = new Date();
      
      // Generate block hash
      const blockHash = this.generateBlockHash(
        userId,
        inferenceId,
        requestHash,
        responseHash,
        previousHash,
        timestamp
      );

      // Create the receipt
      const receipt: InsertUserReceipt = {
        userId,
        inferenceId,
        nodeId,
        model,
        requestHash,
        responseHash,
        previousHash,
        blockHash,
        status: "delivered",
        processingTime: processingTime.toString(),
        tokenCount: tokenCount ? tokenCount.toString() : null
      };

      await storage.createUserReceipt(receipt);
      
      console.log(`📋 Receipt created for user ${userId}: Block #${blockHash.substring(0, 8)}...`);
    } catch (error) {
      console.error("Failed to create receipt:", error);
    }
  }

  /**
   * Verify the integrity of a receipt chain
   */
  static async verifyReceiptChain(userId: string): Promise<boolean> {
    const receipts = await storage.getUserReceipts(userId);
    
    if (receipts.length === 0) {
      return true; // No receipts to verify
    }

    // Verify each receipt's block hash
    for (let i = receipts.length - 1; i >= 0; i--) {
      const receipt = receipts[i];
      const previousHash = i < receipts.length - 1 ? receipts[i + 1].blockHash : null;
      
      // Recalculate the block hash
      const calculatedHash = this.generateBlockHash(
        receipt.userId,
        receipt.inferenceId,
        receipt.requestHash,
        receipt.responseHash,
        previousHash,
        receipt.createdAt!
      );
      
      if (calculatedHash !== receipt.blockHash) {
        console.error(`Chain verification failed at block #${receipt.blockNumber}`);
        return false;
      }
    }
    
    return true;
  }
}