import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useRealtime } from "@/hooks/use-realtime";
import { useAuth } from "@/lib/auth";
import { 
  Network, 
  BarChart3, 
  Server, 
  Receipt, 
  DollarSign, 
  PlusCircle, 
  RotateCw,
  LogOut,
  User
} from "lucide-react";
import { Button } from "@/components/ui/button";

const navigation = [
  { name: "Overview", href: "/", icon: BarChart3 },
  { name: "Nodes", href: "/nodes", icon: Server },
  { name: "Receipts", href: "/receipts", icon: Receipt },
  { name: "Earnings", href: "/earnings", icon: DollarSign },
  { name: "Run a Node", href: "/setup", icon: PlusCircle },
];

export default function Sidebar() {
  const [location] = useLocation();
  const { lastUpdate, isRefreshing } = useRealtime();
  const { user, logout } = useAuth();

  const secondsAgo = Math.floor((Date.now() - lastUpdate.getTime()) / 1000);

  return (
    <aside className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col" data-testid="sidebar">
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-sidebar-primary rounded-lg flex items-center justify-center">
            <Network className="w-4 h-4 text-sidebar-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-sidebar-foreground">DGON Console</h1>
            <p className="text-xs text-muted-foreground">GPU Network</p>
          </div>
        </div>
      </div>
      
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href;
            
            return (
              <li key={item.name}>
                <Link href={item.href}>
                  <span 
                    className={cn(
                      "flex items-center space-x-3 px-3 py-2 rounded-md transition-colors cursor-pointer",
                      isActive
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                    data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.name}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-4 border-t border-sidebar-border space-y-3">
        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
          <div className="status-dot active"></div>
          <span>Connected</span>
          <div className="ml-auto">
            <RotateCw className={cn("w-3 h-3", isRefreshing && "refresh-indicator")} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Last update: <span data-testid="last-update">{secondsAgo}s ago</span>
        </p>
        {user && (
          <div className="pt-2 border-t border-sidebar-border">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <User className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-xs font-medium text-sidebar-foreground" data-testid="text-username">{user.username}</p>
                  <p className="text-xs text-muted-foreground capitalize" data-testid="text-role">{user.role}</p>
                </div>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full justify-start" 
              onClick={logout}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}
