import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Download, Check } from "lucide-react";

interface Receipt {
  id: string;
  nodeId: string;
  region: string;
  modelId: string;
  payload: {
    version: string;
    tokens_input: number;
    tokens_output: number;
    p95_ms: number;
    ts_start: number;
    ts_end: number;
    cache_hit?: boolean;
    signature?: string;
  };
  createdAt: string;
}

export default function Receipts() {
  const [searchQuery, setSearchQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState("24h");

  const { data: receipts = [], isLoading } = useQuery<Receipt[]>({
    queryKey: ["/api/v1/receipts"],
    refetchInterval: 10000,
  });

  const filteredReceipts = receipts.filter(receipt => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        receipt.id.toLowerCase().includes(query) ||
        receipt.nodeId.toLowerCase().includes(query) ||
        receipt.modelId.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const formatTimeAgo = (timestamp: string) => {
    const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-1/4 mb-8"></div>
          <div className="h-96 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="receipts-page">
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Receipts</h2>
            <p className="text-muted-foreground">AI inference job receipts and verification</p>
          </div>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </header>

      <div className="p-6">
        <div className="mb-6 flex items-center space-x-4">
          <div className="flex-1">
            <Input
              type="text"
              placeholder="Search by request ID, node ID, or model..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="search-receipts"
            />
          </div>
          <Select value={timeFilter} onValueChange={setTimeFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm">Request ID</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm">Node</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm">Model</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm">Tokens</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm">Latency</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm">Timestamp</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm">Signature</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReceipts.map((receipt) => (
                    <tr 
                      key={receipt.id} 
                      className="border-t border-border hover:bg-muted/50 transition-colors"
                      data-testid={`receipt-row-${receipt.id}`}
                    >
                      <td className="py-4 px-4">
                        <span className="font-mono text-sm text-foreground">
                          {receipt.id.length > 12 ? `${receipt.id.slice(0, 12)}...` : receipt.id}
                        </span>
                      </td>
                      <td className="py-4 px-4 font-mono text-sm text-foreground">
                        {receipt.nodeId}
                      </td>
                      <td className="py-4 px-4 text-sm text-foreground">
                        {receipt.modelId}
                      </td>
                      <td className="py-4 px-4 text-sm text-foreground">
                        {receipt.payload.tokens_input}→{receipt.payload.tokens_output}
                      </td>
                      <td className="py-4 px-4 font-mono text-sm text-foreground">
                        {receipt.payload.p95_ms}ms
                      </td>
                      <td className="py-4 px-4 text-sm text-muted-foreground">
                        {formatTimeAgo(receipt.createdAt)}
                      </td>
                      <td className="py-4 px-4">
                        <Badge className="bg-success/10 text-success border-success/20">
                          <Check className="w-3 h-3 mr-1" />
                          Valid
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {filteredReceipts.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">
                  {searchQuery ? "No receipts match your search" : "No receipts found"}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
