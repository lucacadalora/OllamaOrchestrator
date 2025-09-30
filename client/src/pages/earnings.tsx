import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { DollarSign, Wallet, Clock, CheckCircle2, XCircle } from "lucide-react";
import MetricCard from "@/components/layout/metric-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface Earning {
  id: number;
  nodeId: string;
  periodStart: string;
  periodEnd: string;
  feesUsd: number;
  jtvoEst: number;
  payoutReady: boolean;
}

export default function Earnings() {
  const { data: earnings, isLoading } = useQuery<Earning[]>({
    queryKey: ["/api/v1/earnings"],
  });

  const totalEarnings = earnings?.reduce((sum, e) => sum + e.feesUsd, 0) || 0;
  const totalJtvo = earnings?.reduce((sum, e) => sum + e.jtvoEst, 0) || 0;
  const readyForPayout = earnings?.filter(e => e.payoutReady) || [];
  const nextPayout = readyForPayout.length > 0 
    ? format(new Date(readyForPayout[0].periodEnd), "MMM d, yyyy")
    : "No payouts ready";

  return (
    <div data-testid="earnings-page">
      <header className="bg-card border-b border-border px-6 py-4">
        <h2 className="text-2xl font-semibold text-foreground">Earnings</h2>
        <p className="text-muted-foreground">Track your node earnings and payout status</p>
      </header>

      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {isLoading ? (
            <>
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </>
          ) : (
            <>
              <MetricCard
                title="Total Earnings"
                value={`$${totalEarnings.toFixed(2)}`}
                subtitle="All time"
                icon={<DollarSign className="h-5 w-5" />}
              />
              
              <MetricCard
                title="JTVO Rewards"
                value={totalJtvo.toLocaleString()}
                subtitle="Estimated tokens"
                icon={<Wallet className="h-5 w-5" />}
              />
              
              <MetricCard
                title="Next Payout"
                value={nextPayout}
                subtitle={`${readyForPayout.length} ready`}
                icon={<Clock className="h-5 w-5" />}
              />
            </>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Earnings History</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : earnings && earnings.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Node ID</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Fees (USD)</TableHead>
                    <TableHead className="text-right">JTVO Est.</TableHead>
                    <TableHead className="text-center">Payout Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {earnings.map((earning) => (
                    <TableRow key={earning.id} data-testid={`earning-row-${earning.id}`}>
                      <TableCell className="font-mono text-sm" data-testid={`text-nodeid-${earning.id}`}>
                        {earning.nodeId}
                      </TableCell>
                      <TableCell data-testid={`text-period-${earning.id}`}>
                        {format(new Date(earning.periodStart), "MMM d")} - {format(new Date(earning.periodEnd), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-right font-medium" data-testid={`text-fees-${earning.id}`}>
                        ${earning.feesUsd.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-medium" data-testid={`text-jtvo-${earning.id}`}>
                        {earning.jtvoEst.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-center" data-testid={`status-payout-${earning.id}`}>
                        {earning.payoutReady ? (
                          <Badge variant="default" className="bg-green-600 dark:bg-green-700">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Ready
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <XCircle className="h-3 w-3 mr-1" />
                            Pending
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No earnings history available</p>
                <p className="text-sm mt-2">Earnings will appear here once calculated from receipts</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
