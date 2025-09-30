import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface StatusBadgeProps {
  status: "active" | "pending" | "offline" | "quarantine";
  className?: string;
}

const statusConfig = {
  active: {
    label: "Active",
    className: "bg-success/10 text-success border-success/20",
    dotClass: "status-dot active",
  },
  pending: {
    label: "Pending", 
    className: "bg-warning/10 text-warning border-warning/20",
    dotClass: "status-dot pending",
  },
  offline: {
    label: "Offline",
    className: "bg-destructive/10 text-destructive border-destructive/20", 
    dotClass: "status-dot offline",
  },
  quarantine: {
    label: "Quarantine",
    className: "bg-orange-100 text-orange-800 border-orange-200",
    dotClass: "status-dot offline",
  },
};

export default function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  
  return (
    <Badge className={cn(config.className, "font-medium", className)}>
      <div className={config.dotClass}></div>
      {config.label}
    </Badge>
  );
}
