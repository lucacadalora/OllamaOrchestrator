import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, AlertCircle, Hash, Link, Clock, Cpu, FileText, ShieldCheck, ShieldAlert } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface UserReceipt {
  id: string;
  userId: string;
  inferenceId: string;
  nodeId: string | null;
  model: string;
  requestHash: string;
  responseHash: string;
  previousHash: string | null;
  blockHash: string;
  blockNumber: number;
  status: string;
  processingTime: string | null;
  tokenCount: string | null;
  createdAt: string;
}

interface ReceiptsResponse {
  receipts: UserReceipt[];
  chainValid: boolean;
  totalReceipts: number;
}

export default function Receipts() {
  const [selectedReceipt, setSelectedReceipt] = useState<UserReceipt | null>(null);

  const { data, isLoading, error, refetch } = useQuery<ReceiptsResponse>({
    queryKey: ["/api/v1/user/receipts"],
  });

  const { data: verifyData, refetch: verifyChain } = useQuery({
    queryKey: ["/api/v1/user/receipts/verify"],
    enabled: false,
  });

  const formatHash = (hash: string | null) => {
    if (!hash) return "Genesis";
    return `${hash.substring(0, 6)}...${hash.substring(hash.length - 4)}`;
  };

  const formatProcessingTime = (time: string | null) => {
    if (!time) return "N/A";
    const ms = parseFloat(time);
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  if (isLoading) {
    return (
      <div className="container py-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse text-muted-foreground">Loading receipts...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container py-8 max-w-7xl mx-auto">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Error Loading Receipts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Failed to load your receipts. Please try again.</p>
            <Button onClick={() => refetch()} className="mt-4" variant="outline">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const receipts = data?.receipts || [];
  const chainValid = data?.chainValid ?? false;

  return (
    <div className="container py-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">AI Task Receipts</h1>
        <p className="text-muted-foreground">
          Blockchain-style proof of AI task delivery. Each receipt is cryptographically linked to the previous one.
        </p>
      </div>

      {/* Chain Status Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Hash className="w-5 h-5" />
              Blockchain Status
            </span>
            <Button 
              onClick={() => verifyChain()} 
              variant="outline" 
              size="sm"
              data-testid="button-verify-chain"
            >
              <ShieldCheck className="w-4 h-4 mr-2" />
              Verify Chain
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Receipts</p>
                <p className="text-xl font-semibold" data-testid="text-total-receipts">{data?.totalReceipts || 0}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Link className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Latest Block</p>
                <p className="text-xl font-semibold" data-testid="text-latest-block">
                  #{receipts[0]?.blockNumber || 0}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${chainValid ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                {chainValid ? (
                  <ShieldCheck className="w-5 h-5 text-green-500" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-red-500" />
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Chain Integrity</p>
                <p className="text-xl font-semibold" data-testid="text-chain-status">
                  {chainValid ? (
                    <span className="text-green-500">Valid</span>
                  ) : (
                    <span className="text-red-500">Invalid</span>
                  )}
                </p>
              </div>
            </div>
          </div>
          
          {verifyData && (
            <div className="mt-4 p-3 rounded-lg bg-muted">
              <p className="text-sm flex items-center gap-2">
                {(verifyData as any).chainValid ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className="text-green-600 dark:text-green-400">
                      {(verifyData as any).message}
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <span className="text-red-600 dark:text-red-400">
                      {(verifyData as any).message}
                    </span>
                  </>
                )}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Receipts List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Receipt Chain</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[600px]">
                {receipts.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground">
                    No receipts yet. Complete some AI tasks to see receipts here.
                  </div>
                ) : (
                  <div className="p-6 space-y-4">
                    {receipts.map((receipt, index) => (
                      <div key={receipt.id}>
                        <button
                          onClick={() => setSelectedReceipt(receipt)}
                          className="w-full text-left group"
                          data-testid={`receipt-block-${receipt.blockNumber}`}
                        >
                          <Card className="transition-all hover:shadow-md group-hover:border-primary/50">
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-3">
                                  <div className="p-2 rounded-lg bg-primary/10">
                                    <Hash className="w-4 h-4 text-primary" />
                                  </div>
                                  <div>
                                    <p className="font-semibold text-sm">Block #{receipt.blockNumber}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {formatDistanceToNow(new Date(receipt.createdAt), { addSuffix: true })}
                                    </p>
                                  </div>
                                </div>
                                <Badge 
                                  variant={receipt.status === "delivered" ? "default" : "destructive"}
                                  className="text-xs"
                                >
                                  {receipt.status}
                                </Badge>
                              </div>
                              
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">Model:</span>
                                  <span className="font-mono">{receipt.model}</span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">Block Hash:</span>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <span className="font-mono text-primary">
                                          {formatHash(receipt.blockHash)}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p className="font-mono text-xs break-all max-w-xs">
                                          {receipt.blockHash}
                                        </p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground">Previous:</span>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <span className="font-mono flex items-center gap-1">
                                          <Link className="w-3 h-3" />
                                          {formatHash(receipt.previousHash)}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p className="font-mono text-xs break-all max-w-xs">
                                          {receipt.previousHash || "Genesis Block"}
                                        </p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                                
                                {receipt.processingTime && (
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">Processing:</span>
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {formatProcessingTime(receipt.processingTime)}
                                    </span>
                                  </div>
                                )}
                                
                                {receipt.tokenCount && (
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">Tokens:</span>
                                    <span className="flex items-center gap-1">
                                      <Cpu className="w-3 h-3" />
                                      {receipt.tokenCount}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        </button>
                        
                        {index < receipts.length - 1 && (
                          <div className="flex justify-center my-2">
                            <div className="w-0.5 h-6 bg-border" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Receipt Details */}
        <div>
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle>Receipt Details</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedReceipt ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium mb-1">Block Number</p>
                    <p className="text-2xl font-bold">#{selectedReceipt.blockNumber}</p>
                  </div>
                  
                  <Separator />
                  
                  <div>
                    <p className="text-sm font-medium mb-1">Inference ID</p>
                    <p className="font-mono text-xs break-all text-muted-foreground">
                      {selectedReceipt.inferenceId}
                    </p>
                  </div>
                  
                  <div>
                    <p className="text-sm font-medium mb-1">Request Hash</p>
                    <p className="font-mono text-xs break-all text-muted-foreground">
                      {selectedReceipt.requestHash}
                    </p>
                  </div>
                  
                  <div>
                    <p className="text-sm font-medium mb-1">Response Hash</p>
                    <p className="font-mono text-xs break-all text-muted-foreground">
                      {selectedReceipt.responseHash}
                    </p>
                  </div>
                  
                  <div>
                    <p className="text-sm font-medium mb-1">Block Hash</p>
                    <p className="font-mono text-xs break-all text-primary">
                      {selectedReceipt.blockHash}
                    </p>
                  </div>
                  
                  {selectedReceipt.nodeId && (
                    <div>
                      <p className="text-sm font-medium mb-1">Node ID</p>
                      <p className="font-mono text-xs break-all text-muted-foreground">
                        {selectedReceipt.nodeId}
                      </p>
                    </div>
                  )}
                  
                  <Separator />
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Model</p>
                      <p className="font-medium">{selectedReceipt.model}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Status</p>
                      <Badge variant={selectedReceipt.status === "delivered" ? "default" : "destructive"}>
                        {selectedReceipt.status}
                      </Badge>
                    </div>
                    {selectedReceipt.processingTime && (
                      <div>
                        <p className="text-muted-foreground">Processing</p>
                        <p className="font-medium">{formatProcessingTime(selectedReceipt.processingTime)}</p>
                      </div>
                    )}
                    {selectedReceipt.tokenCount && (
                      <div>
                        <p className="text-muted-foreground">Tokens</p>
                        <p className="font-medium">{selectedReceipt.tokenCount}</p>
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <p className="text-sm text-muted-foreground">Created</p>
                    <p className="text-sm font-medium">
                      {new Date(selectedReceipt.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Select a receipt to view details
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}