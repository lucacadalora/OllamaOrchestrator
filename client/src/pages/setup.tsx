import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Laptop, Server, Monitor, Download, Copy, CheckCircle } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface RegistrationResponse {
  status: string;
  nodeId: string;
  nodeToken: string;
}

export default function Setup() {
  const [nodeId, setNodeId] = useState(`node-${Math.random().toString(36).substr(2, 9)}`);
  const [region, setRegion] = useState("ap-southeast");
  const [selectedOS, setSelectedOS] = useState<"mac" | "windows">("mac");
  const [registrationData, setRegistrationData] = useState<RegistrationResponse | null>(null);
  const { toast } = useToast();

  const registerMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/v1/nodes/register", {
        id: nodeId,
        region,
        runtime: "ollama",
        asnHint: "residential",
        walletAddress: "",
        greenEnergy: false,
      });
      return response.json();
    },
    onSuccess: (data: RegistrationResponse) => {
      setRegistrationData(data);
      toast({
        title: "Node Registered",
        description: "Your node has been successfully registered!",
      });
    },
    onError: (error) => {
      toast({
        title: "Registration Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: "Command copied to clipboard",
    });
  };

  // Generate OS-specific command
  const getMacLinuxScript = () => registrationData ? `
# Copy and paste this entire block into your terminal:

DGON_API="${window.location.origin}/api" \\
NODE_ID="${registrationData.nodeId}" \\
REGION="${region}" \\
NODE_TOKEN="${registrationData.nodeToken}" \\
bash -c '
  echo "📥 Downloading DGON agent..."
  curl -s -o agent.py ${window.location.origin}/agent.py
  echo "🚀 Starting DGON node agent..."
  python3 -u agent.py
'
`.trim() : "";

  const getWindowsScript = () => registrationData ? `
# Copy and paste this into PowerShell (recommended for Windows):

Set-Location $env:USERPROFILE; $env:DGON_API="${window.location.origin}/api"; $env:NODE_ID="${registrationData.nodeId}"; $env:REGION="${region}"; $env:NODE_TOKEN="${registrationData.nodeToken}"; Invoke-WebRequest -Uri "${window.location.origin}/agent.py" -OutFile "agent.py"; python -u agent.py
`.trim() : "";

  const agentScript = selectedOS === "windows" ? getWindowsScript() : getMacLinuxScript();

  return (
    <div data-testid="setup-page">
      <header className="bg-card border-b border-border px-6 py-4">
        <h2 className="text-2xl font-semibold text-foreground">Run a Node</h2>
        <p className="text-muted-foreground">Set up your machine as a DGON compute node</p>
      </header>

      <div className="p-6">
        <div className="max-w-4xl">
          {/* Platform Selection */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card 
              className={`text-center cursor-pointer border-2 transition-all ${
                selectedOS === "mac" 
                  ? "border-primary bg-primary/5" 
                  : "border-border hover:border-primary/50"
              }`}
              onClick={() => setSelectedOS("mac")}
            >
              <CardContent className="p-6">
                <div className={`w-16 h-16 rounded-lg flex items-center justify-center mx-auto mb-4 ${
                  selectedOS === "mac" ? "bg-primary/10" : "bg-muted"
                }`}>
                  <Laptop className={`w-8 h-8 ${selectedOS === "mac" ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <h3 className="font-semibold text-foreground mb-2">macOS / Linux</h3>
                <p className="text-sm text-muted-foreground">Bash terminal</p>
                <Badge className={`mt-2 ${
                  selectedOS === "mac" 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-muted text-muted-foreground"
                }`}>
                  {selectedOS === "mac" ? "Selected" : "Supported"}
                </Badge>
              </CardContent>
            </Card>

            <Card 
              className={`text-center cursor-pointer border-2 transition-all ${
                selectedOS === "windows" 
                  ? "border-primary bg-primary/5" 
                  : "border-border hover:border-primary/50"
              }`}
              onClick={() => setSelectedOS("windows")}
            >
              <CardContent className="p-6">
                <div className={`w-16 h-16 rounded-lg flex items-center justify-center mx-auto mb-4 ${
                  selectedOS === "windows" ? "bg-primary/10" : "bg-muted"
                }`}>
                  <Monitor className={`w-8 h-8 ${selectedOS === "windows" ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Windows</h3>
                <p className="text-sm text-muted-foreground">PowerShell</p>
                <Badge className={`mt-2 ${
                  selectedOS === "windows" 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-muted text-muted-foreground"
                }`}>
                  {selectedOS === "windows" ? "Selected" : "Supported"}
                </Badge>
              </CardContent>
            </Card>

            <Card className="text-center opacity-50">
              <CardContent className="p-6">
                <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center mx-auto mb-4">
                  <Server className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-muted-foreground mb-2">Docker</h3>
                <p className="text-sm text-muted-foreground">Coming soon</p>
              </CardContent>
            </Card>
          </div>

          {/* Setup Steps */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Setup ({selectedOS === "windows" ? "Windows" : "macOS / Linux"})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Step 1: Install Ollama */}
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0">
                    1
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-foreground mb-2">Install Ollama</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      Download and install Ollama on your {selectedOS === "windows" ? "PC" : "Mac"}, then pull a model
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <a 
                          href={selectedOS === "windows" 
                            ? "https://ollama.com/download/windows" 
                            : "https://ollama.com/download/mac"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-sm"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download Ollama for {selectedOS === "windows" ? "Windows" : "Mac"}
                        </a>
                      </div>
                      <p className="text-xs text-muted-foreground">After installing, run in {selectedOS === "windows" ? "PowerShell" : "terminal"}:</p>
                      <div className="flex items-center space-x-2">
                        <code className="block p-3 bg-muted rounded-md font-mono text-sm flex-1">
                          ollama pull llama3.2
                        </code>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard("ollama pull llama3.2")}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 2: Register Node */}
                <div className="flex items-start space-x-4">
                  <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0">
                    2
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-foreground mb-2">Register Your Node</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      Register your {selectedOS === "windows" ? "PC" : "machine"} as a compute node in the network
                    </p>
                    <div className="flex items-center space-x-2 mb-3">
                      <input
                        type="text"
                        value={nodeId}
                        onChange={(e) => setNodeId(e.target.value)}
                        className="px-3 py-2 border border-border rounded-md text-sm bg-background flex-1"
                        placeholder="Node ID"
                      />
                      <select
                        value={region}
                        onChange={(e) => setRegion(e.target.value)}
                        className="px-3 py-2 border border-border rounded-md text-sm bg-background"
                      >
                        <option value="ap-southeast">ap-southeast</option>
                        <option value="us-west">us-west</option>
                        <option value="eu-central">eu-central</option>
                      </select>
                    </div>
                    <Button
                      onClick={() => registerMutation.mutate()}
                      disabled={registerMutation.isPending || !!registrationData}
                      data-testid="register-node"
                    >
                      {registerMutation.isPending ? "Registering..." : 
                       registrationData ? <><CheckCircle className="w-4 h-4 mr-2" />Registered</> : "Register Node"}
                    </Button>
                  </div>
                </div>

                {/* Step 3: Run Agent */}
                {registrationData && (
                  <div className="flex items-start space-x-4">
                    <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0">
                      3
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-foreground mb-2">Run the Agent</h4>
                      <p className="text-sm text-muted-foreground mb-3">
                        Start the agent with your node configuration
                      </p>
                      <div className="flex items-center space-x-2">
                        <pre className="block p-3 bg-muted rounded-md font-mono text-sm flex-1 overflow-x-auto">
                          {agentScript}
                        </pre>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(agentScript)}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Keep the terminal open while running the agent. Your node will appear in the Nodes tab once connected.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
