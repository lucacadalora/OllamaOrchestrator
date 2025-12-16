import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Bot, Send, User, Loader2, Wifi, WifiOff, Brain, 
  Copy, RefreshCw, ChevronDown, ChevronUp, Image, Paperclip,
  Globe, Layers, Check
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useStreamingChat } from "@/hooks/useStreamingChat";
import { StreamingMessage } from "@/components/StreamingMessage";
import { ReasoningDisplay } from "@/components/ReasoningDisplay";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string;
  timestamp: Date;
  nodeId?: string;
  thinkingTime?: number;
}

interface Model {
  model: string;
  nodeCount: number;
  nodes: string[];
}

interface ModelsResponse {
  models: Model[];
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

function WorldMapVisualization({ nodes }: { nodes: string[] }) {
  const nodeLocations = nodes.map((nodeId, idx) => {
    const hash = hashCode(nodeId);
    return {
      id: nodeId,
      x: 15 + ((hash % 70) + idx * 7) % 70,
      y: 20 + ((hash % 35) + idx * 5) % 35,
    };
  });

  return (
    <div className="relative w-full h-48 bg-gradient-to-b from-slate-900/50 to-slate-800/30 rounded-xl overflow-hidden">
      <svg viewBox="0 0 100 60" className="w-full h-full opacity-30">
        <g fill="none" stroke="#64748b" strokeWidth="0.15">
          <ellipse cx="50" cy="30" rx="35" ry="20" />
          <ellipse cx="30" cy="25" rx="12" ry="10" />
          <ellipse cx="70" cy="28" rx="14" ry="12" />
          <ellipse cx="45" cy="40" rx="8" ry="6" />
          <ellipse cx="25" cy="35" rx="6" ry="4" />
          <ellipse cx="75" cy="22" rx="5" ry="4" />
        </g>
      </svg>
      
      <svg viewBox="0 0 100 60" className="absolute inset-0 w-full h-full">
        {nodeLocations.map((node, idx) => (
          <g key={node.id}>
            {idx > 0 && nodeLocations[idx - 1] && (
              <line
                x1={nodeLocations[idx - 1].x}
                y1={nodeLocations[idx - 1].y}
                x2={node.x}
                y2={node.y}
                stroke="#05aa6c"
                strokeWidth="0.3"
                strokeDasharray="1,1"
                opacity="0.5"
              />
            )}
            <circle
              cx={node.x}
              cy={node.y}
              r="1.5"
              fill="#05aa6c"
              className="animate-pulse"
            />
            <circle
              cx={node.x}
              cy={node.y}
              r="3"
              fill="none"
              stroke="#05aa6c"
              strokeWidth="0.3"
              opacity="0.4"
            />
          </g>
        ))}
      </svg>
      
      <div className="absolute bottom-3 left-3 flex items-center gap-2 text-xs text-slate-400">
        <Globe className="w-3 h-3" />
        <span>{nodes.length} active nodes</span>
      </div>
    </div>
  );
}

function InferenceJobsPanel({ nodes, isExpanded, onToggle }: { 
  nodes: string[]; 
  isExpanded: boolean; 
  onToggle: () => void;
}) {
  return (
    <div className="w-full max-w-2xl mx-auto">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2 text-sm text-muted-foreground hover:bg-muted/50 rounded-lg transition-colors"
        data-testid="toggle-inference-jobs"
      >
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4" />
          <span>Inference Jobs</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs">{nodes.length} Active</span>
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>
      
      {isExpanded && (
        <div className="mt-4 space-y-4">
          <WorldMapVisualization nodes={nodes} />
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-muted/30 rounded-lg p-3">
              <div className="text-2xl font-semibold text-foreground">{nodes.length}</div>
              <div className="text-xs text-muted-foreground">Workers Online</div>
            </div>
            <div className="bg-muted/30 rounded-lg p-3">
              <div className="text-2xl font-semibold text-foreground">{nodes.length * 72}</div>
              <div className="text-xs text-muted-foreground">Layers Distributed</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AssistantMessage({ 
  message, 
  isStreaming, 
  currentResponse, 
  currentReasoning,
  isCurrentMessage,
  httpStreamingMessageId
}: { 
  message: Message;
  isStreaming: boolean;
  currentResponse: string;
  currentReasoning: string;
  isCurrentMessage: boolean;
  httpStreamingMessageId: string | null;
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

  const showReasoning = message.reasoning || (isCurrentMessage && currentReasoning);
  const reasoningContent = isCurrentMessage ? currentReasoning : message.reasoning;
  const displayThinkingTime = message.thinkingTime ? `${message.thinkingTime.toFixed(1)}s` : null;

  return (
    <div className="flex gap-3" data-testid={`message-assistant-${message.id}`}>
      <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
        <Bot className="w-5 h-5 text-emerald-500" />
      </div>
      <div className="flex-1 space-y-2">
        {showReasoning && (
          <ReasoningDisplay
            reasoning={reasoningContent || ""}
            isStreaming={isStreaming && isCurrentMessage && !!currentReasoning}
          />
        )}
        
        <div className="bg-muted rounded-xl px-4 py-3">
          <StreamingMessage 
            content={message.content} 
            isStreaming={(isStreaming && isCurrentMessage) || (message.id === httpStreamingMessageId)}
            isWaitingForResponse={!message.content && (isCurrentMessage || message.id === httpStreamingMessageId)}
            className="text-sm" 
          />
        </div>
        
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {displayThinkingTime && (
            <span className="flex items-center gap-1">
              <Brain className="w-3 h-3" />
              Thought for {displayThinkingTime}
            </span>
          )}
          
          <div className="flex items-center gap-1 ml-auto">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={handleCopy}
              data-testid={`copy-message-${message.id}`}
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              <span className="ml-1">{copied ? 'Copied' : 'Copy'}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function UserMessage({ message }: { message: Message }) {
  return (
    <div className="flex gap-3 justify-end" data-testid={`message-user-${message.id}`}>
      <div className="max-w-[70%] bg-emerald-600 text-white rounded-xl px-4 py-3">
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
      </div>
      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
        <User className="w-5 h-5 text-muted-foreground" />
      </div>
    </div>
  );
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [thinkingEnabled, setThinkingEnabled] = useState(true);
  const [showInferenceJobs, setShowInferenceJobs] = useState(true);
  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const currentMessageIdRef = useRef<string | null>(null);
  const messageStartTimesRef = useRef<Map<string, number>>(new Map());

  const { 
    isStreaming, 
    currentResponse, 
    currentReasoning, 
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

  // Update current streaming message with live content
  useEffect(() => {
    if (currentMessageIdRef.current && (currentResponse || currentReasoning)) {
      setMessages(prev => prev.map(msg =>
        msg.id === currentMessageIdRef.current
          ? { ...msg, content: currentResponse, reasoning: currentReasoning || undefined }
          : msg
      ));
    }
  }, [currentResponse, currentReasoning]);

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
    
    // Build conversation payload BEFORE updating state to ensure we include the new user message
    const allMessages = [
      ...messages.map(m => ({ role: m.role, content: m.content })), 
      { role: "user" as const, content: userContent }
    ];
    
    setMessages(prev => [...prev, userMessage, assistantMessage]);
    currentMessageIdRef.current = assistantMessageId;
    messageStartTimesRef.current.set(assistantMessageId, Date.now());
    setInput("");
    
    await sendStreamingMessage(
      selectedModel,
      allMessages,
      { think: thinkingEnabled },
      undefined, // onToken - handled by useEffect watching currentResponse
      (fullResponse, fullReasoning) => {
        const startTime = messageStartTimesRef.current.get(assistantMessageId);
        const thinkingTime = startTime ? (Date.now() - startTime) / 1000 : undefined;
        
        setMessages(prev => prev.map(msg =>
          msg.id === assistantMessageId
            ? { ...msg, content: fullResponse, reasoning: fullReasoning || undefined, thinkingTime }
            : msg
        ));
        
        messageStartTimesRef.current.delete(assistantMessageId);
        currentMessageIdRef.current = null;
      },
      (error) => {
        toast({
          title: "Error",
          description: error,
          variant: "destructive",
        });
        currentMessageIdRef.current = null;
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
  const hasMessages = messages.length > 0;

  const suggestions = [
    "Explain quantum computing in simple terms",
    "Write a Python function to sort a list",
    "What are the benefits of distributed AI?",
    "Help me debug my code"
  ];

  return (
    <div className="flex flex-col h-full min-h-screen bg-background" data-testid="chat-page">
      <header className="border-b border-border px-6 py-3 flex items-center justify-between bg-card/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
            <span className="text-white font-bold text-sm">G</span>
          </div>
          <h1 className="text-lg font-semibold">Gradient Chat</h1>
        </div>
        <div className="flex items-center gap-2">
          {isStreaming ? (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Streaming
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
              <Wifi className="w-3 h-3 mr-1" />
              Ready
            </Badge>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex flex-col">
        <ScrollArea className="flex-1 p-6" ref={scrollAreaRef}>
          {!hasMessages ? (
            <div className="max-w-2xl mx-auto pt-16 pb-8">
              <div className="text-center mb-12">
                <h2 className="text-4xl font-bold mb-3 bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent">
                  Welcome to Gradient.
                </h2>
                <p className="text-muted-foreground">
                  Distributed AI inference across a global network of nodes
                </p>
              </div>

              <InferenceJobsPanel 
                nodes={allNodes}
                isExpanded={showInferenceJobs}
                onToggle={() => setShowInferenceJobs(!showInferenceJobs)}
              />

              <div className="mt-8">
                <p className="text-sm text-muted-foreground mb-3">Try asking:</p>
                <div className="grid grid-cols-2 gap-2">
                  {suggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      onClick={() => setInput(suggestion)}
                      className="text-left px-4 py-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-sm text-muted-foreground hover:text-foreground"
                      data-testid={`suggestion-${idx}`}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6 max-w-3xl mx-auto pb-4">
              {messages.map((message) => (
                message.role === "user" ? (
                  <UserMessage key={message.id} message={message} />
                ) : (
                  <AssistantMessage 
                    key={message.id}
                    message={message}
                    isStreaming={isStreaming}
                    currentResponse={currentResponse}
                    currentReasoning={currentReasoning}
                    isCurrentMessage={message.id === currentMessageIdRef.current}
                    httpStreamingMessageId={null}
                  />
                )
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="border-t border-border bg-card/50 p-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center gap-2">
                <Switch
                  checked={thinkingEnabled}
                  onCheckedChange={setThinkingEnabled}
                  id="thinking-toggle"
                  data-testid="thinking-toggle"
                />
                <label htmlFor="thinking-toggle" className="text-sm text-muted-foreground flex items-center gap-1">
                  <Brain className="w-4 h-4" />
                  Thinking
                </label>
              </div>

              <Select value={selectedModel || ""} onValueChange={setSelectedModel}>
                <SelectTrigger className="w-48 h-8 text-sm" data-testid="model-select">
                  <SelectValue placeholder={loadingModels ? "Loading..." : "Select model"} />
                </SelectTrigger>
                <SelectContent>
                  {models.map((model) => (
                    <SelectItem key={model.model} value={model.model}>
                      <div className="flex items-center gap-2">
                        <span>{model.model}</span>
                        <Badge variant="secondary" className="text-xs">
                          {model.nodeCount} nodes
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMessages([])}
                  className="ml-auto text-xs"
                  data-testid="clear-chat"
                >
                  Clear
                </Button>
              )}
            </div>

            <div className="flex items-end gap-2 bg-muted/30 rounded-xl p-2 border border-border">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-9 w-9 text-muted-foreground shrink-0"
                onClick={handleFileUpload}
                data-testid="file-upload-button"
              >
                <Paperclip className="w-4 h-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-9 w-9 text-muted-foreground shrink-0"
                onClick={handleImageUpload}
                data-testid="image-upload-button"
              >
                <Image className="w-4 h-4" />
              </Button>
              
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={selectedModel ? "Message Gradient..." : "Select a model first..."}
                disabled={!selectedModel || isStreaming}
                className="flex-1 bg-transparent resize-none border-0 focus:outline-none focus:ring-0 py-2 px-2 text-sm min-h-[40px] max-h-32"
                rows={1}
                data-testid="chat-input"
              />
              
              <Button
                onClick={handleSend}
                disabled={!selectedModel || !input.trim() || isStreaming}
                className="h-9 w-9 shrink-0 bg-emerald-500 hover:bg-emerald-600 text-white"
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
            
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Powered by distributed inference across {allNodes.length} nodes
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
