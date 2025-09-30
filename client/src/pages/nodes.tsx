import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/ui/status-badge";
import { Eye, Laptop, Server, Monitor, Activity, Zap, TrendingUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface Node {
  id: string;
  region: string;
  runtime: string;
  status: "active" | "pending" | "offline" | "quarantine";
  reputation: number;
  greenEnergy: boolean;
  lastHeartbeat: string | null;
}

interface NodeMetrics {
  nodeId: string;
  timeWindow: string;
  requestCount: number;
  latency: {
    p50: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
    avg: number;
  } | null;
  tokens: {
    totalInput: number;
    totalOutput: number;
    avgInput: number;
    avgOutput: number;
  } | null;
  cacheHitRate: number;
}

export default function Nodes() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [regionFilter, setRegionFilter] = useState<string>("all");
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [metricsWindow, setMetricsWindow] = useState<string>("24h");

  const { data: nodes = [], isLoading } = useQuery<Node[]>({
    queryKey: ["/api/v1/nodes"],
    refetchInterval: 5000,
  });

  const { data: metrics, isLoading: metricsLoading } = useQuery<NodeMetrics>({
    queryKey: ["/api/v1/nodes", selectedNode, "metrics", metricsWindow],
    enabled: !!selectedNode,
  });

  const filteredNodes = nodes.filter(node => {
    if (statusFilter !== "all" && node.status !== statusFilter) return false;
    if (regionFilter !== "all" && node.region !== regionFilter) return false;
    return true;
  });

  const uniqueRegions = [...new Set(nodes.map(n => n.region))];

  const getNodeIcon = (runtime: string) => {
    switch (runtime) {
      case "ollama":
        return <Laptop className="w-4 h-4 text-primary" />;
      case "vllm":
        return <Server className="w-4 h-4 text-primary" />;
      default:
        return <Monitor className="w-4 h-4 text-primary" />;
    }
  };

  const formatTimeAgo = (timestamp: string | null) => {
    if (!timestamp) return "—";
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
    <div data-testid="nodes-page">
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Nodes</h2>
            <p className="text-muted-foreground">Manage and monitor GPU compute nodes</p>
          </div>
          <div className="flex items-center space-x-3">
            <Select value={regionFilter} onValueChange={setRegionFilter}>
              <SelectTrigger className="w-40" data-testid="filter-region">
                <SelectValue placeholder="All Regions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Regions</SelectItem>
                {uniqueRegions.map(region => (
                  <SelectItem key={region} value={region}>{region}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40" data-testid="filter-status">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
                <SelectItem value="quarantine">Quarantine</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <div className="p-6">
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm">Node ID</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm">Region</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm">Runtime</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm">Reputation</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm">P95 Latency</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm">Last Heartbeat</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground text-sm">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredNodes.map((node) => (
                    <tr 
                      key={node.id} 
                      className="border-t border-border hover:bg-muted/50 transition-colors"
                      data-testid={`node-row-${node.id}`}
                    >
                      <td className="py-4 px-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-primary/10 rounded-md flex items-center justify-center">
                            {getNodeIcon(node.runtime)}
                          </div>
                          <span className="font-mono text-sm text-foreground">{node.id}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <StatusBadge status={node.status} />
                      </td>
                      <td className="py-4 px-4 text-sm text-foreground">{node.region}</td>
                      <td className="py-4 px-4">
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-accent text-accent-foreground">
                          {node.runtime}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center space-x-2">
                          <div className="w-12 bg-muted rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full ${
                                node.reputation >= 80 ? "bg-success" : 
                                node.reputation >= 60 ? "bg-warning" : "bg-destructive"
                              }`}
                              style={{ width: `${node.reputation}%` }}
                            ></div>
                          </div>
                          <span className="text-sm text-foreground">{Math.round(node.reputation)}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4 font-mono text-sm text-foreground">
                        {node.status === "active" ? "~250ms" : "—"}
                      </td>
                      <td className="py-4 px-4 text-sm text-muted-foreground">
                        {formatTimeAgo(node.lastHeartbeat)}
                      </td>
                      <td className="py-4 px-4">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setSelectedNode(node.id)}
                          data-testid={`view-node-${node.id}`}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {filteredNodes.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">
                  No nodes match the current filters
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Node Metrics Dialog */}
      <Dialog open={!!selectedNode} onOpenChange={(open) => !open && setSelectedNode(null)}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-auto" data-testid="node-metrics-modal">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Node Metrics: {selectedNode}</DialogTitle>
              <Select value={metricsWindow} onValueChange={setMetricsWindow}>
                <SelectTrigger className="w-32" data-testid="select-metrics-window">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">Last Hour</SelectItem>
                  <SelectItem value="24h">Last 24h</SelectItem>
                  <SelectItem value="7d">Last 7 Days</SelectItem>
                  <SelectItem value="30d">Last 30 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </DialogHeader>

          {metricsLoading ? (
            <div className="space-y-4">
              <div className="h-32 bg-muted rounded animate-pulse" />
              <div className="h-64 bg-muted rounded animate-pulse" />
            </div>
          ) : metrics ? (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Activity className="h-4 w-4 text-primary" />
                      Request Count
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold" data-testid="text-request-count">
                      {metrics.requestCount.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      in {metrics.timeWindow}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      Avg Latency
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold" data-testid="text-avg-latency">
                      {metrics.latency ? `${Math.round(metrics.latency.avg)}ms` : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      P95: {metrics.latency ? `${Math.round(metrics.latency.p95)}ms` : "—"}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Zap className="h-4 w-4 text-primary" />
                      Cache Hit Rate
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold" data-testid="text-cache-hit-rate">
                      {metrics.cacheHitRate.toFixed(1)}%
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      cache efficiency
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Latency Chart */}
              {metrics.latency && (
                <Card>
                  <CardHeader>
                    <CardTitle>Latency Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        data={[
                          { name: "Min", value: metrics.latency.min },
                          { name: "P50", value: metrics.latency.p50 },
                          { name: "Avg", value: metrics.latency.avg },
                          { name: "P95", value: metrics.latency.p95 },
                          { name: "P99", value: metrics.latency.p99 },
                          { name: "Max", value: metrics.latency.max },
                        ]}
                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis label={{ value: "Latency (ms)", angle: -90, position: "insideLeft" }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="value" fill="hsl(var(--primary))" name="Latency (ms)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Token Stats */}
              {metrics.tokens && (
                <Card>
                  <CardHeader>
                    <CardTitle>Token Statistics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Input</p>
                        <p className="text-xl font-bold mt-1" data-testid="text-total-input">
                          {metrics.tokens.totalInput.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total Output</p>
                        <p className="text-xl font-bold mt-1" data-testid="text-total-output">
                          {metrics.tokens.totalOutput.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Avg Input</p>
                        <p className="text-xl font-bold mt-1" data-testid="text-avg-input">
                          {metrics.tokens.avgInput.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Avg Output</p>
                        <p className="text-xl font-bold mt-1" data-testid="text-avg-output">
                          {metrics.tokens.avgOutput.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No metrics data available for this node
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
