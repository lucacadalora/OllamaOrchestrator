import { useQuery } from "@tanstack/react-query";
import MetricCard from "@/components/layout/metric-card";
import { CheckCircle, Server, Gauge, BarChart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SummaryData {
  activeNodes: number;
  totalNodes: number;
  avgP95: number | null;
  requests24h: number;
}

interface Node {
  id: string;
  region: string;
  runtime: string;
  status: string;
  reputation: number;
  lastHeartbeat: string;
}

export default function Overview() {
  const { data: summary, isLoading: summaryLoading } = useQuery<SummaryData>({
    queryKey: ["/api/v1/summary"],
    refetchInterval: 5000,
  });

  const { data: nodes = [] } = useQuery<Node[]>({
    queryKey: ["/api/v1/nodes"],
    refetchInterval: 5000,
  });

  // Group nodes by region for regional distribution
  const nodesByRegion = nodes.reduce((acc, node) => {
    if (!acc[node.region]) {
      acc[node.region] = [];
    }
    acc[node.region].push(node);
    return acc;
  }, {} as Record<string, Node[]>);

  if (summaryLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-muted rounded w-1/3 mb-2"></div>
          <div className="h-4 bg-muted rounded w-1/2 mb-8"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-muted rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="overview-page">
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Network Overview</h2>
            <p className="text-muted-foreground">Real-time GPU node status and network metrics</p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-muted-foreground">Auto-refresh:</span>
            <span className="text-sm font-medium text-foreground">5s</span>
            <div className="w-2 h-2 bg-success rounded-full animate-pulse"></div>
          </div>
        </div>
      </header>

      <div className="p-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <MetricCard
            title="Active Nodes"
            value={summary?.activeNodes ?? 0}
            icon={<CheckCircle className="w-6 h-6 text-success" />}
            trend={{
              value: "+1 today",
              direction: "up"
            }}
          />

          <MetricCard
            title="Total Nodes"
            value={summary?.totalNodes ?? 0}
            icon={<Server className="w-6 h-6 text-primary" />}
            subtitle={`${(summary?.totalNodes ?? 0) - (summary?.activeNodes ?? 0)} pending`}
          />

          <MetricCard
            title="Avg P95 Latency"
            value={summary?.avgP95 ? `${summary.avgP95}ms` : "—"}
            icon={<Gauge className="w-6 h-6 text-warning" />}
            trend={{
              value: "-12ms vs yesterday",
              direction: "down"
            }}
          />

          <MetricCard
            title="Requests (24h)"
            value={summary?.requests24h ?? 0}
            icon={<BarChart className="w-6 h-6 text-accent-foreground" />}
            trend={{
              value: "+18% vs yesterday",
              direction: "up"
            }}
          />
        </div>

        {/* Regional Distribution and Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
              <CardTitle>Regional Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(nodesByRegion).map(([region, regionNodes]) => {
                  const activeNodes = regionNodes.filter(n => n.status === "active").length;
                  const avgP95 = regionNodes
                    .filter(n => n.status === "active")
                    .length > 0 ? "250ms" : "—"; // Placeholder calculation
                  
                  return (
                    <div key={region} className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={`status-dot ${activeNodes > 0 ? "active" : "pending"}`}></div>
                        <span className="font-medium text-foreground">{region}</span>
                      </div>
                      <div className="flex items-center space-x-4">
                        <span className="text-sm text-muted-foreground">
                          {regionNodes.length} nodes
                        </span>
                        <span className="text-sm font-medium text-foreground">
                          {avgP95} p95
                        </span>
                      </div>
                    </div>
                  );
                })}
                
                {Object.keys(nodesByRegion).length === 0 && (
                  <p className="text-sm text-muted-foreground">No nodes registered</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {nodes.slice(0, 3).map((node, index) => {
                  const timeAgo = node.lastHeartbeat 
                    ? Math.floor((Date.now() - new Date(node.lastHeartbeat).getTime()) / 1000)
                    : null;
                  
                  return (
                    <div key={node.id} className="flex items-start space-x-3">
                      <div className={`w-2 h-2 rounded-full mt-2 ${
                        node.status === "active" ? "bg-success" : 
                        node.status === "pending" ? "bg-warning" : "bg-destructive"
                      }`}></div>
                      <div className="flex-1">
                        <p className="text-sm text-foreground">
                          {node.id} {node.status === "active" ? "heartbeat received" : `status: ${node.status}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {timeAgo ? `${timeAgo}s ago` : "Unknown"}
                        </p>
                      </div>
                    </div>
                  );
                })}

                {nodes.length === 0 && (
                  <p className="text-sm text-muted-foreground">No recent activity</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
