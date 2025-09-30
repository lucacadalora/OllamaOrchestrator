import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Download, Check, ChevronLeft, ChevronRight, Filter, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [modelFilter, setModelFilter] = useState<string>("all");
  const [regionFilter, setRegionFilter] = useState<string>("all");
  const [cacheFilter, setCacheFilter] = useState<string>("all");
  const itemsPerPage = 20;

  const { data: receipts = [], isLoading } = useQuery<Receipt[]>({
    queryKey: ["/api/v1/receipts"],
    refetchInterval: 10000,
  });

  // Extract unique values for filters
  const uniqueModels = Array.from(new Set(receipts.map(r => r.modelId)));
  const uniqueRegions = Array.from(new Set(receipts.map(r => r.region)));

  const filteredReceipts = receipts.filter(receipt => {
    // Time filter
    const now = Date.now();
    const receiptTime = new Date(receipt.createdAt).getTime();
    const timeWindowMs = {
      "24h": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
      "30d": 30 * 24 * 60 * 60 * 1000,
    }[timeFilter];
    
    if (timeWindowMs && (now - receiptTime) > timeWindowMs) {
      return false;
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!(
        receipt.id.toLowerCase().includes(query) ||
        receipt.nodeId.toLowerCase().includes(query) ||
        receipt.modelId.toLowerCase().includes(query)
      )) {
        return false;
      }
    }

    // Model filter
    if (modelFilter !== "all" && receipt.modelId !== modelFilter) {
      return false;
    }

    // Region filter
    if (regionFilter !== "all" && receipt.region !== regionFilter) {
      return false;
    }

    // Cache filter
    if (cacheFilter !== "all") {
      if (cacheFilter === "hit" && !receipt.payload.cache_hit) return false;
      if (cacheFilter === "miss" && receipt.payload.cache_hit) return false;
    }

    return true;
  });

  // Pagination
  const totalPages = Math.ceil(filteredReceipts.length / itemsPerPage);
  const paginatedReceipts = filteredReceipts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const clearFilters = () => {
    setModelFilter("all");
    setRegionFilter("all");
    setCacheFilter("all");
  };

  const hasActiveFilters = modelFilter !== "all" || regionFilter !== "all" || cacheFilter !== "all";

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, timeFilter, modelFilter, regionFilter, cacheFilter]);

  // Clamp current page if it exceeds available pages
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

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
          
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" data-testid="button-filters">
                <Filter className="w-4 h-4 mr-2" />
                Filters
                {hasActiveFilters && (
                  <Badge variant="secondary" className="ml-2">
                    {[modelFilter !== "all", regionFilter !== "all", cacheFilter !== "all"].filter(Boolean).length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" data-testid="filters-popover">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Filters</h4>
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
                      <X className="w-4 h-4 mr-1" />
                      Clear
                    </Button>
                  )}
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-2 block">Model</label>
                  <Select value={modelFilter} onValueChange={setModelFilter}>
                    <SelectTrigger data-testid="select-model-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Models</SelectItem>
                      {uniqueModels.map(model => (
                        <SelectItem key={model} value={model}>{model}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Region</label>
                  <Select value={regionFilter} onValueChange={setRegionFilter}>
                    <SelectTrigger data-testid="select-region-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Regions</SelectItem>
                      {uniqueRegions.map(region => (
                        <SelectItem key={region} value={region}>{region}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Cache Status</label>
                  <Select value={cacheFilter} onValueChange={setCacheFilter}>
                    <SelectTrigger data-testid="select-cache-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="hit">Cache Hit</SelectItem>
                      <SelectItem value="miss">Cache Miss</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Select value={timeFilter} onValueChange={setTimeFilter}>
            <SelectTrigger className="w-40" data-testid="select-time-filter">
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
                  {paginatedReceipts.map((receipt) => (
                    <tr 
                      key={receipt.id} 
                      className="border-t border-border hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => setSelectedReceipt(receipt)}
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
                        {receipt.payload.signature ? (
                          <Badge className="bg-success/10 text-success border-success/20">
                            <Check className="w-3 h-3 mr-1" />
                            Signed
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            Unsigned
                          </Badge>
                        )}
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredReceipts.length)} of {filteredReceipts.length} receipts
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Previous
              </Button>
              <div className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                data-testid="button-next-page"
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Receipt Detail Modal */}
      <Dialog open={!!selectedReceipt} onOpenChange={(open) => !open && setSelectedReceipt(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto" data-testid="receipt-detail-modal">
          <DialogHeader>
            <DialogTitle>Receipt Details</DialogTitle>
          </DialogHeader>
          {selectedReceipt && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Receipt ID</label>
                  <p className="font-mono text-sm mt-1" data-testid="text-receipt-id">{selectedReceipt.id}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Node ID</label>
                  <p className="font-mono text-sm mt-1" data-testid="text-node-id">{selectedReceipt.nodeId}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Model</label>
                  <p className="text-sm mt-1" data-testid="text-model">{selectedReceipt.modelId}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Region</label>
                  <p className="text-sm mt-1" data-testid="text-region">{selectedReceipt.region}</p>
                </div>
              </div>

              {/* Payload JSON */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Request Payload</label>
                <Card>
                  <CardContent className="p-4">
                    <pre className="text-xs overflow-auto bg-muted p-3 rounded" data-testid="json-payload">
                      {JSON.stringify(selectedReceipt.payload, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              </div>

              {/* Signature */}
              {selectedReceipt.payload.signature && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">Signature</label>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-start space-x-3">
                        <Badge className="bg-success/10 text-success border-success/20">
                          <Check className="w-3 h-3 mr-1" />
                          Present
                        </Badge>
                        <div className="flex-1">
                          <p className="font-mono text-xs break-all text-muted-foreground" data-testid="text-signature">
                            {selectedReceipt.payload.signature}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Note: Signature verification occurs during receipt submission
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Full JSON */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Full Receipt JSON</label>
                <Card>
                  <CardContent className="p-4">
                    <pre className="text-xs overflow-auto bg-muted p-3 rounded max-h-64" data-testid="json-full-receipt">
                      {JSON.stringify(selectedReceipt, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
