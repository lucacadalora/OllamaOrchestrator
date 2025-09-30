import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, ProtectedRoute } from "@/lib/auth";
import Sidebar from "@/components/layout/sidebar";
import Overview from "@/pages/overview";
import Nodes from "@/pages/nodes";
import Receipts from "@/pages/receipts";
import UserReceipts from "@/pages/UserReceipts";
import Earnings from "@/pages/earnings";
import Setup from "@/pages/setup";
import Chat from "@/pages/chat";
import Login from "@/pages/login";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route>
        <ProtectedRoute>
          <div className="h-full flex">
            <Sidebar />
            <main className="flex-1 overflow-auto">
              <Switch>
                <Route path="/" component={Overview} />
                <Route path="/nodes" component={Nodes} />
                <Route path="/receipts" component={Receipts} />
                <Route path="/user-receipts" component={UserReceipts} />
                <Route path="/earnings" component={Earnings} />
                <Route path="/setup" component={Setup} />
                <Route path="/chat" component={Chat} />
                <Route component={NotFound} />
              </Switch>
            </main>
          </div>
        </ProtectedRoute>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
