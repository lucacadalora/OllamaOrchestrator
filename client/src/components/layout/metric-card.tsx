import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  icon?: ReactNode;
  trend?: {
    value: string;
    direction: "up" | "down";
    isPositive?: boolean;
  };
  subtitle?: string;
  className?: string;
  children?: ReactNode;
}

export default function MetricCard({
  title,
  value,
  icon,
  trend,
  subtitle,
  className,
  children,
}: MetricCardProps) {
  return (
    <div className={cn("metric-card", className)}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold text-foreground">{value}</p>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
        {icon && (
          <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
            {icon}
          </div>
        )}
      </div>
      
      {trend && (
        <div className="mt-4 flex items-center">
          <span
            className={cn(
              "text-sm",
              trend.isPositive !== false ? "text-success" : "text-destructive"
            )}
          >
            {trend.direction === "up" ? "↗" : "↘"} {trend.value}
          </span>
        </div>
      )}
      
      {children}
    </div>
  );
}
