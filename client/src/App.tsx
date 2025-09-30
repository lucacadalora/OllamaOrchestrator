import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Sidebar from "@/components/layout/sidebar";
import Overview from "@/pages/overview";
import Nodes from "@/pages/nodes";
import Receipts from "@/pages/receipts";
import Earnings from "@/pages/earnings";
import Setup from "@/pages/setup";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <div className="h-full flex">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Switch>
          <Route path="/" component={Overview} />
          <Route path="/nodes" component={Nodes} />
          <Route path="/receipts" component={Receipts} />
          <Route path="/earnings" component={Earnings} />
          <Route path="/setup" component={Setup} />
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
