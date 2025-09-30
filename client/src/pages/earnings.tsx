import MetricCard from "@/components/layout/metric-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Earnings() {
  return (
    <div data-testid="earnings-page">
      <header className="bg-card border-b border-border px-6 py-4">
        <h2 className="text-2xl font-semibold text-foreground">Earnings</h2>
        <p className="text-muted-foreground">Track your node earnings and payout status</p>
      </header>

      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <MetricCard
            title="Total Earnings"
            value="$247.82"
            subtitle="This month"
          />
          
          <MetricCard
            title="JTVO Rewards"
            value="1,250"
            subtitle="Estimated tokens"
          />
          
          <MetricCard
            title="Next Payout"
            value="Dec 1, 2025"
            subtitle="Ready for payout"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Payout History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <p>No payout history available</p>
              <p className="text-sm mt-2">Earnings will appear here once your first payout is processed</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
