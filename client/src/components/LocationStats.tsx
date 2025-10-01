import { Node } from '@shared/schema';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Globe, MapPin } from 'lucide-react';

interface LocationStatsProps {
  nodes: Node[];
}

export function LocationStats({ nodes }: LocationStatsProps) {
  const nodesWithLocation = nodes.filter(n => n.country);
  
  // Count nodes by country
  const countryStats = nodesWithLocation.reduce((acc, node) => {
    const country = node.country!;
    if (!acc[country]) {
      acc[country] = { count: 0, cities: new Set<string>() };
    }
    acc[country].count++;
    if (node.city) {
      acc[country].cities.add(node.city);
    }
    return acc;
  }, {} as Record<string, { count: number; cities: Set<string> }>);

  const sortedCountries = Object.entries(countryStats)
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 10); // Top 10 countries

  const totalCountries = Object.keys(countryStats).length;
  const totalCities = new Set(nodesWithLocation.map(n => n.city).filter(Boolean)).size;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Countries</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-countries">{totalCountries}</div>
            <p className="text-xs text-muted-foreground">
              {nodesWithLocation.length} nodes with location
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cities</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-cities">{totalCities}</div>
            <p className="text-xs text-muted-foreground">
              Unique city locations
            </p>
          </CardContent>
        </Card>
      </div>

      {sortedCountries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Nodes by Country</CardTitle>
            <CardDescription>Distribution of nodes across regions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sortedCountries.map(([country, stats]) => (
                <div key={country} className="flex items-center justify-between" data-testid={`country-stat-${country}`}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{country}</span>
                      <span className="text-sm text-muted-foreground">
                        {stats.cities.size} {stats.cities.size === 1 ? 'city' : 'cities'}
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 mt-1">
                      <div
                        className="bg-primary rounded-full h-2 transition-all"
                        style={{
                          width: `${(stats.count / nodesWithLocation.length) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                  <span className="ml-4 font-semibold" data-testid={`country-count-${country}`}>
                    {stats.count}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
