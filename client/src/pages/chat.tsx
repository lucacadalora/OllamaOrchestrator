import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Bot, Send, User, Loader2,
  Copy, Image, Paperclip,
  Check, Maximize2, Minimize2
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useStreamingChat } from "@/hooks/useStreamingChat";
import { StreamingMessage } from "@/components/StreamingMessage";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  nodeId?: string;
}

interface Model {
  model: string;
  nodeCount: number;
  nodes: string[];
}

interface ModelsResponse {
  models: Model[];
}

interface NodeInfo {
  id: string;
  region: string;
  runtime: string;
  status: string;
}

const hashCode = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
};

const REGIONS = [
  "Tokyo, Japan",
  "Osaka, Japan",
  "Seoul, Korea",
  "Singapore",
  "San Francisco, USA",
  "New York, USA",
  "London, UK",
  "Frankfurt, Germany",
  "Sydney, Australia",
  "Mumbai, India"
];

const GPU_TYPES = [
  "RTX 4090 (24GB)",
  "RTX 4080 (16GB)",
  "RTX 3090 (24GB)",
  "A100 (40GB)",
  "A10G (24GB)"
];

function getNodeDetails(nodeId: string) {
  const hash = hashCode(nodeId);
  return {
    region: REGIONS[hash % REGIONS.length],
    gpu: GPU_TYPES[hash % GPU_TYPES.length],
    blocksServed: 200 + (hash % 400)
  };
}

function DistributionGraph({ nodes, isActive }: { nodes: string[]; isActive: boolean }) {
  const nodeCount = Math.max(nodes.length, 1);
  const angleStep = (2 * Math.PI) / Math.max(nodeCount, 6);
  
  return (
    <div className="relative w-28 h-28">
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <circle
          cx="50"
          cy="50"
          r="35"
          fill="none"
          stroke="hsl(210, 40%, 90%)"
          strokeWidth="2"
          className="dark:stroke-slate-700"
        />
        
        {nodes.slice(0, 8).map((nodeId, idx) => {
          const angle = angleStep * idx - Math.PI / 2;
          const x = 50 + 35 * Math.cos(angle);
          const y = 50 + 35 * Math.sin(angle);
          
          return (
            <g key={`${nodeId}-${idx}`}>
              <line
                x1="50"
                y1="50"
                x2={x}
                y2={y}
                stroke={isActive ? "hsl(210, 100%, 50%)" : "hsl(210, 40%, 80%)"}
                strokeWidth="1.5"
                className={isActive ? "animate-pulse" : ""}
                strokeDasharray={isActive ? "4,2" : "none"}
              />
              <circle
                cx={x}
                cy={y}
                r="5"
                fill={isActive ? "hsl(210, 100%, 50%)" : "hsl(210, 40%, 70%)"}
                className={isActive ? "animate-pulse" : ""}
              />
            </g>
          );
        })}
        
        <circle
          cx="50"
          cy="50"
          r="12"
          fill={isActive ? "hsl(210, 100%, 50%)" : "hsl(210, 40%, 60%)"}
          className={isActive ? "animate-pulse" : ""}
        />
        <text
          x="50"
          y="54"
          textAnchor="middle"
          fill="white"
          fontSize="10"
          fontWeight="bold"
        >
          {nodeCount}
        </text>
      </svg>
    </div>
  );
}

function WorkerProgressBar({ 
  progress, 
  isActive,
  blocksServed 
}: { 
  progress: number; 
  isActive: boolean;
  blocksServed: number;
}) {
  const totalBlocks = 20;
  const filledBlocks = Math.floor((progress / 100) * totalBlocks);
  
  return (
    <div className="space-y-1">
      <div className="flex gap-0.5">
        {Array.from({ length: totalBlocks }).map((_, idx) => (
          <div
            key={idx}
            className={`h-4 w-2 rounded-sm transition-all duration-150 ${
              idx < filledBlocks
                ? isActive 
                  ? "bg-primary animate-pulse" 
                  : "bg-primary/60"
                : "bg-muted"
            }`}
            style={{
              animationDelay: isActive ? `${idx * 50}ms` : "0ms"
            }}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        served {blocksServed + (isActive ? Math.floor(progress * 2) : 0)} blocks
      </p>
    </div>
  );
}

function WorkerStatusCard({ 
  nodeId, 
  isActive,
  progress 
}: { 
  nodeId: string; 
  isActive: boolean;
  progress: number;
}) {
  const details = getNodeDetails(nodeId);
  
  return (
    <div className="py-3 border-b border-border last:border-0">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-sm font-medium text-foreground">{details.gpu}</p>
          <p className="text-xs text-muted-foreground">{details.region}</p>
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          isActive 
            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" 
            : "bg-muted text-muted-foreground"
        }`}>
          {isActive ? "Working" : "Idle"}
        </span>
      </div>
      <WorkerProgressBar 
        progress={isActive ? progress : 0} 
        isActive={isActive}
        blocksServed={details.blocksServed}
      />
    </div>
  );
}

function InferenceBackendPanel({ 
  model, 
  nodes, 
  isStreaming,
  streamProgress
}: { 
  model: string | null;
  nodes: string[];
  isStreaming: boolean;
  streamProgress: number;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  
  if (!isExpanded) {
    return (
      <div className="h-full flex items-start justify-center pt-4">
        <button
          onClick={() => setIsExpanded(true)}
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
          data-testid="expand-inference-panel"
        >
          <Maximize2 className="w-5 h-5" />
        </button>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col bg-card border-l border-border" data-testid="inference-panel">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="font-semibold text-foreground">Inference Backend</h2>
        <button
          onClick={() => setIsExpanded(false)}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
          data-testid="collapse-inference-panel"
        >
          <Minimize2 className="w-4 h-4" />
        </button>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {/* Model & Distribution */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Model</p>
              <p className="text-lg font-semibold text-primary">
                {model || "No model selected"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1 text-right">Distribution</p>
              <DistributionGraph nodes={nodes} isActive={isStreaming} />
            </div>
          </div>
          
          {/* Workers Count */}
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Workers</p>
            <p className="text-3xl font-bold text-foreground">{nodes.length}</p>
          </div>
          
          {/* Worker Status */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Worker Status</p>
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${isStreaming ? "bg-green-500 animate-pulse" : "bg-muted-foreground/30"}`} />
                <span className="text-xs text-muted-foreground">
                  {isStreaming ? "Processing" : "Standby"}
                </span>
              </div>
            </div>
            
            {nodes.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">No workers connected</p>
                <p className="text-xs text-muted-foreground mt-1">Start an agent to begin</p>
              </div>
            ) : (
              <div className="space-y-0">
                {nodes.slice(0, 6).map((nodeId, idx) => (
                  <WorkerStatusCard
                    key={`${nodeId}-${idx}`}
                    nodeId={nodeId}
                    isActive={isStreaming && idx === 0}
                    progress={streamProgress}
                  />
                ))}
                {nodes.length > 6 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    +{nodes.length - 6} more workers
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function AssistantMessage({ 
  message, 
  isStreaming, 
  currentResponse,
  isCurrentMessage
}: { 
  message: Message;
  isStreaming: boolean;
  currentResponse: string;
  isCurrentMessage: boolean;
}) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <div className="flex gap-3" data-testid={`message-assistant-${message.id}`}>
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
        <Bot className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 space-y-2 min-w-0">
        <div className="bg-card border border-border rounded-2xl px-4 py-3">
          <StreamingMessage 
            content={message.content} 
            isStreaming={isStreaming && isCurrentMessage}
            isWaitingForResponse={!message.content && isCurrentMessage}
            className="text-sm text-foreground" 
          />
        </div>
        
        {message.content && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 hover:text-primary transition-colors"
              data-testid={`copy-message-${message.id}`}
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function UserMessage({ message }: { message: Message }) {
  return (
    <div className="flex gap-3 justify-end" data-testid={`message-user-${message.id}`}>
      <div className="max-w-[85%] bg-primary text-primary-foreground rounded-2xl px-4 py-3">
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
      </div>
      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-1">
        <User className="w-4 h-4 text-muted-foreground" />
      </div>
    </div>
  );
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [streamProgress, setStreamProgress] = useState(0);
  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const currentMessageIdRef = useRef<string | null>(null);

  const { 
    isStreaming, 
    currentResponse, 
    sendMessage: sendStreamingMessage 
  } = useStreamingChat();

  const { data: modelsData, isLoading: loadingModels } = useQuery<ModelsResponse>({
    queryKey: ["/api/v1/models"],
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (modelsData?.models && modelsData.models.length > 0 && !selectedModel) {
      setSelectedModel(modelsData.models[0].model);
    }
  }, [modelsData, selectedModel]);

  useEffect(() => {
    if (currentMessageIdRef.current && currentResponse) {
      setMessages(prev => prev.map(msg =>
        msg.id === currentMessageIdRef.current
          ? { ...msg, content: currentResponse }
          : msg
      ));
      
      // Update stream progress based on response length
      const progressEstimate = Math.min((currentResponse.length / 500) * 100, 100);
      setStreamProgress(progressEstimate);
    }
  }, [currentResponse]);

  // Reset progress when streaming stops
  useEffect(() => {
    if (!isStreaming) {
      setTimeout(() => setStreamProgress(0), 1000);
    }
  }, [isStreaming]);

  const handleFileUpload = () => {
    toast({
      title: "Coming Soon",
      description: "File upload will be available in a future update",
    });
  };

  const handleImageUpload = () => {
    toast({
      title: "Coming Soon", 
      description: "Image upload will be available in a future update",
    });
  };

  const handleSend = async () => {
    if (!input.trim() || !selectedModel || isStreaming) return;

    const userContent = input.trim();
    const userMessage: Message = {
      id: `msg-${Date.now()}-user`,
      role: "user",
      content: userContent,
      timestamp: new Date(),
    };
    
    const assistantMessageId = `msg-${Date.now()}-assistant`;
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };
    
    const allMessages = [
      ...messages.map(m => ({ role: m.role, content: m.content })), 
      { role: "user" as const, content: userContent }
    ];
    
    setMessages(prev => [...prev, userMessage, assistantMessage]);
    currentMessageIdRef.current = assistantMessageId;
    setStreamProgress(0);
    setInput("");
    
    await sendStreamingMessage(
      selectedModel,
      allMessages,
      { think: false },
      undefined,
      (fullResponse) => {
        setMessages(prev => prev.map(msg =>
          msg.id === assistantMessageId
            ? { ...msg, content: fullResponse }
            : msg
        ));
        currentMessageIdRef.current = null;
        setStreamProgress(100);
      },
      (error) => {
        toast({
          title: "Error",
          description: error,
          variant: "destructive",
        });
        currentMessageIdRef.current = null;
        setStreamProgress(0);
      }
    );
  };

  useEffect(() => {
    if (scrollAreaRef.current) {
      requestAnimationFrame(() => {
        if (scrollAreaRef.current) {
          scrollAreaRef.current.scrollTo({
            top: scrollAreaRef.current.scrollHeight,
            behavior: 'smooth'
          });
        }
      });
    }
  }, [messages, currentResponse]);

  const models = modelsData?.models || [];
  const allNodes = models.flatMap(m => m.nodes);
  const selectedModelNodes = models.find(m => m.model === selectedModel)?.nodes || [];
  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-full min-h-screen bg-background" data-testid="chat-page">
      {/* Left side - Chat */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 overflow-hidden flex flex-col">
          {!hasMessages ? (
            /* Welcome screen */
            <div className="flex-1 flex flex-col items-center justify-center px-6">
              <div className="w-full max-w-xl space-y-8">
                {/* Welcome heading */}
                <h1 className="text-4xl md:text-5xl font-semibold text-center text-foreground tracking-tight">
                  Welcome to DGON Network.
                </h1>

                {/* Input box */}
                <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
                  <div className="p-4">
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder="How can I help you today?"
                      disabled={!selectedModel || isStreaming}
                      className="w-full bg-transparent resize-none border-0 focus:outline-none focus:ring-0 text-foreground placeholder:text-muted-foreground text-base min-h-[24px] max-h-32"
                      rows={1}
                      data-testid="chat-input"
                    />
                  </div>
                  
                  {/* Toolbar */}
                  <div className="px-3 pb-3 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={handleImageUpload}
                        className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
                        data-testid="image-upload-button"
                      >
                        <Image className="w-5 h-5" />
                      </button>
                      <button
                        onClick={handleFileUpload}
                        className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
                        data-testid="file-upload-button"
                      >
                        <Paperclip className="w-5 h-5" />
                      </button>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Select value={selectedModel || ""} onValueChange={setSelectedModel}>
                        <SelectTrigger 
                          className="h-9 border-0 bg-transparent hover:bg-muted text-foreground text-sm font-medium gap-1 px-3 shadow-none focus:ring-0"
                          data-testid="model-select"
                        >
                          <SelectValue placeholder={loadingModels ? "Loading..." : "Select model"} />
                        </SelectTrigger>
                        <SelectContent>
                          {models.map((model) => (
                            <SelectItem 
                              key={model.model} 
                              value={model.model}
                            >
                              {model.model}
                            </SelectItem>
                          ))}
                          {models.length === 0 && (
                            <div className="px-3 py-2 text-sm text-muted-foreground">
                              No models available
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                      
                      <Button
                        onClick={handleSend}
                        disabled={!selectedModel || !input.trim() || isStreaming}
                        className="h-9 w-9 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-none disabled:opacity-40"
                        size="icon"
                        data-testid="send-button"
                      >
                        {isStreaming ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Conversation view */
            <>
              <ScrollArea className="flex-1 px-6 py-4" ref={scrollAreaRef}>
                <div className="space-y-6 max-w-2xl mx-auto pb-4">
                  {messages.map((message) => (
                    message.role === "user" ? (
                      <UserMessage key={message.id} message={message} />
                    ) : (
                      <AssistantMessage 
                        key={message.id}
                        message={message}
                        isStreaming={isStreaming}
                        currentResponse={currentResponse}
                        isCurrentMessage={message.id === currentMessageIdRef.current}
                      />
                    )
                  ))}
                </div>
              </ScrollArea>

              {/* Chat input at bottom when in conversation */}
              <div className="px-6 pb-6 pt-2">
                <div className="max-w-2xl mx-auto">
                  <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
                    <div className="p-4">
                      <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                          }
                        }}
                        placeholder="Message DGON..."
                        disabled={!selectedModel || isStreaming}
                        className="w-full bg-transparent resize-none border-0 focus:outline-none focus:ring-0 text-foreground placeholder:text-muted-foreground text-sm min-h-[24px] max-h-32"
                        rows={1}
                        data-testid="chat-input-conversation"
                      />
                    </div>
                    
                    <div className="px-3 pb-3 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={handleImageUpload}
                          className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
                        >
                          <Image className="w-4 h-4" />
                        </button>
                        <button
                          onClick={handleFileUpload}
                          className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
                        >
                          <Paperclip className="w-4 h-4" />
                        </button>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Select value={selectedModel || ""} onValueChange={setSelectedModel}>
                          <SelectTrigger 
                            className="h-8 border-0 bg-transparent hover:bg-muted text-foreground text-xs font-medium gap-1 px-2 shadow-none focus:ring-0"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {models.map((model) => (
                              <SelectItem 
                                key={model.model} 
                                value={model.model}
                                className="text-sm"
                              >
                                {model.model}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        
                        <Button
                          onClick={handleSend}
                          disabled={!selectedModel || !input.trim() || isStreaming}
                          className="h-8 w-8 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-none disabled:opacity-40"
                          size="icon"
                        >
                          {isStreaming ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Send className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                  
                  {/* New chat button */}
                  <div className="flex justify-center mt-3">
                    <button
                      onClick={() => setMessages([])}
                      className="text-xs text-muted-foreground hover:text-primary transition-colors"
                      data-testid="new-chat-button"
                    >
                      New conversation
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* Right side - Inference Backend Panel */}
      <div className="w-80 lg:w-96 flex-shrink-0 hidden md:block">
        <InferenceBackendPanel 
          model={selectedModel}
          nodes={selectedModelNodes.length > 0 ? selectedModelNodes : allNodes}
          isStreaming={isStreaming}
          streamProgress={streamProgress}
        />
      </div>
    </div>
  );
}
