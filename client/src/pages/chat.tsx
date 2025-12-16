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
  Bot, Send, User, Loader2, Brain, 
  Copy, ChevronDown, ChevronUp, Image, Paperclip,
  Globe, Check, Sparkles
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

function NetworkVisualization({ nodes }: { nodes: string[] }) {
  const nodeLocations = nodes.slice(0, 12).map((nodeId, idx) => {
    const hash = hashCode(nodeId);
    return {
      id: `${nodeId}-${idx}`,
      x: 10 + ((hash % 80) + idx * 6) % 80,
      y: 15 + ((hash % 40) + idx * 4) % 40,
    };
  });

  return (
    <div className="relative w-full h-32 rounded-xl overflow-hidden bg-[#e8ebe4]/50">
      <svg viewBox="0 0 100 50" className="w-full h-full">
        <defs>
          <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#4a9d7c" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#4a9d7c" stopOpacity="0.1" />
          </linearGradient>
        </defs>
        
        {nodeLocations.map((node, idx) => (
          <g key={node.id}>
            {idx > 0 && nodeLocations[idx - 1] && (
              <line
                x1={nodeLocations[idx - 1].x}
                y1={nodeLocations[idx - 1].y}
                x2={node.x}
                y2={node.y}
                stroke="url(#lineGrad)"
                strokeWidth="0.5"
              />
            )}
            <circle
              cx={node.x}
              cy={node.y}
              r="1.2"
              fill="#4a9d7c"
              className="animate-pulse"
            />
          </g>
        ))}
      </svg>
      
      <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-xs text-[#4a6d5c]">
        <div className="flex items-center gap-1.5">
          <Globe className="w-3 h-3" />
          <span>{nodes.length} nodes online</span>
        </div>
        <div className="flex items-center gap-3">
          <span>{nodes.length * 72} layers</span>
        </div>
      </div>
    </div>
  );
}

function AssistantMessage({ 
  message, 
  isStreaming, 
  currentResponse, 
  currentReasoning,
  isCurrentMessage
}: { 
  message: Message;
  isStreaming: boolean;
  currentResponse: string;
  currentReasoning: string;
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

  const showReasoning = message.reasoning || (isCurrentMessage && currentReasoning);
  const reasoningContent = isCurrentMessage ? currentReasoning : message.reasoning;
  const displayThinkingTime = message.thinkingTime ? `${message.thinkingTime.toFixed(1)}s` : null;

  return (
    <div className="flex gap-3" data-testid={`message-assistant-${message.id}`}>
      <div className="w-7 h-7 rounded-full bg-[#4a9d7c]/10 flex items-center justify-center flex-shrink-0 mt-1">
        <Bot className="w-4 h-4 text-[#4a9d7c]" />
      </div>
      <div className="flex-1 space-y-2 min-w-0">
        {showReasoning && (
          <ReasoningDisplay
            reasoning={reasoningContent || ""}
            isStreaming={isStreaming && isCurrentMessage && !!currentReasoning}
          />
        )}
        
        <div className="bg-white/80 rounded-2xl px-4 py-3 shadow-sm">
          <StreamingMessage 
            content={message.content} 
            isStreaming={isStreaming && isCurrentMessage}
            isWaitingForResponse={!message.content && isCurrentMessage}
            className="text-sm text-[#1a2e23]" 
          />
        </div>
        
        <div className="flex items-center gap-2 text-xs text-[#6b7c72]">
          {displayThinkingTime && (
            <span className="flex items-center gap-1">
              <Brain className="w-3 h-3" />
              Thought for {displayThinkingTime}
            </span>
          )}
          
          {message.content && (
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 hover:text-[#4a9d7c] transition-colors ml-auto"
              data-testid={`copy-message-${message.id}`}
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function UserMessage({ message }: { message: Message }) {
  return (
    <div className="flex gap-3 justify-end" data-testid={`message-user-${message.id}`}>
      <div className="max-w-[75%] bg-[#4a9d7c] text-white rounded-2xl px-4 py-3 shadow-sm">
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
      </div>
      <div className="w-7 h-7 rounded-full bg-[#d4dbd6] flex items-center justify-center flex-shrink-0 mt-1">
        <User className="w-4 h-4 text-[#5a6b5f]" />
      </div>
    </div>
  );
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [showNetwork, setShowNetwork] = useState(false);
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
      undefined,
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

  return (
    <div className="flex flex-col h-full min-h-screen bg-[#f4f6f1]" data-testid="chat-page">
      {/* Minimal header with logo */}
      <header className="px-6 py-4">
        <div className="flex items-center gap-2 text-[#1a2e23]">
          <span className="text-xl font-medium tracking-tight">./</span>
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex flex-col">
        {!hasMessages ? (
          /* Welcome screen */
          <div className="flex-1 flex flex-col items-center justify-center px-6">
            <div className="w-full max-w-xl space-y-8">
              {/* Welcome heading */}
              <h1 className="text-4xl md:text-5xl font-serif text-center text-[#1a2e23] tracking-tight">
                Welcome to DGON Network.
              </h1>

              {/* Input box */}
              <div className="bg-white rounded-2xl shadow-sm border border-[#e0e5dc] overflow-hidden">
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
                    className="w-full bg-transparent resize-none border-0 focus:outline-none focus:ring-0 text-[#1a2e23] placeholder:text-[#9ca89f] text-base min-h-[24px] max-h-32"
                    rows={1}
                    data-testid="chat-input"
                  />
                </div>
                
                {/* Toolbar */}
                <div className="px-3 pb-3 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {/* Attachment buttons */}
                    <button
                      onClick={handleImageUpload}
                      className="p-2 rounded-lg hover:bg-[#f4f6f1] text-[#6b7c72] transition-colors"
                      data-testid="image-upload-button"
                    >
                      <Image className="w-5 h-5" />
                    </button>
                    <button
                      onClick={handleFileUpload}
                      className="p-2 rounded-lg hover:bg-[#f4f6f1] text-[#6b7c72] transition-colors"
                      data-testid="file-upload-button"
                    >
                      <Paperclip className="w-5 h-5" />
                    </button>
                    
                    {/* Thinking toggle */}
                    <button
                      onClick={() => setThinkingEnabled(!thinkingEnabled)}
                      className={`ml-1 px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-1.5 transition-all ${
                        thinkingEnabled 
                          ? 'bg-[#4a9d7c] text-white' 
                          : 'border border-[#4a9d7c] text-[#4a9d7c] hover:bg-[#4a9d7c]/5'
                      }`}
                      data-testid="thinking-toggle"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Thinking
                    </button>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {/* Model selector */}
                    <Select value={selectedModel || ""} onValueChange={setSelectedModel}>
                      <SelectTrigger 
                        className="h-9 border-0 bg-transparent hover:bg-[#f4f6f1] text-[#1a2e23] text-sm font-medium gap-1 px-3 shadow-none focus:ring-0"
                        data-testid="model-select"
                      >
                        <SelectValue placeholder={loadingModels ? "Loading..." : "Select model"} />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-[#e0e5dc]">
                        {models.map((model) => (
                          <SelectItem 
                            key={model.model} 
                            value={model.model}
                            className="text-[#1a2e23]"
                          >
                            {model.model}
                          </SelectItem>
                        ))}
                        {models.length === 0 && (
                          <div className="px-3 py-2 text-sm text-[#9ca89f]">
                            No models available
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                    
                    {/* Send button */}
                    <Button
                      onClick={handleSend}
                      disabled={!selectedModel || !input.trim() || isStreaming}
                      className="h-9 w-9 rounded-full bg-[#4a9d7c] hover:bg-[#3d8567] text-white shadow-none disabled:opacity-40"
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
                      currentReasoning={currentReasoning}
                      isCurrentMessage={message.id === currentMessageIdRef.current}
                    />
                  )
                ))}
              </div>
            </ScrollArea>

            {/* Chat input at bottom when in conversation */}
            <div className="px-6 pb-6 pt-2">
              <div className="max-w-2xl mx-auto">
                <div className="bg-white rounded-2xl shadow-sm border border-[#e0e5dc] overflow-hidden">
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
                      className="w-full bg-transparent resize-none border-0 focus:outline-none focus:ring-0 text-[#1a2e23] placeholder:text-[#9ca89f] text-sm min-h-[24px] max-h-32"
                      rows={1}
                      data-testid="chat-input-conversation"
                    />
                  </div>
                  
                  <div className="px-3 pb-3 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={handleImageUpload}
                        className="p-2 rounded-lg hover:bg-[#f4f6f1] text-[#6b7c72] transition-colors"
                      >
                        <Image className="w-4 h-4" />
                      </button>
                      <button
                        onClick={handleFileUpload}
                        className="p-2 rounded-lg hover:bg-[#f4f6f1] text-[#6b7c72] transition-colors"
                      >
                        <Paperclip className="w-4 h-4" />
                      </button>
                      
                      <button
                        onClick={() => setThinkingEnabled(!thinkingEnabled)}
                        className={`ml-1 px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1 transition-all ${
                          thinkingEnabled 
                            ? 'bg-[#4a9d7c] text-white' 
                            : 'border border-[#4a9d7c] text-[#4a9d7c] hover:bg-[#4a9d7c]/5'
                        }`}
                      >
                        <Sparkles className="w-3 h-3" />
                        Thinking
                      </button>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Select value={selectedModel || ""} onValueChange={setSelectedModel}>
                        <SelectTrigger 
                          className="h-8 border-0 bg-transparent hover:bg-[#f4f6f1] text-[#1a2e23] text-xs font-medium gap-1 px-2 shadow-none focus:ring-0"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white border-[#e0e5dc]">
                          {models.map((model) => (
                            <SelectItem 
                              key={model.model} 
                              value={model.model}
                              className="text-[#1a2e23] text-sm"
                            >
                              {model.model}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      
                      <Button
                        onClick={handleSend}
                        disabled={!selectedModel || !input.trim() || isStreaming}
                        className="h-8 w-8 rounded-full bg-[#4a9d7c] hover:bg-[#3d8567] text-white shadow-none disabled:opacity-40"
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
                    className="text-xs text-[#6b7c72] hover:text-[#4a9d7c] transition-colors"
                    data-testid="new-chat-button"
                  >
                    New conversation
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
        
        {/* Explore serving network footer */}
        <div className="px-6 pb-4">
          <div className="max-w-xl mx-auto">
            <button
              onClick={() => setShowNetwork(!showNetwork)}
              className="w-full flex items-center justify-center gap-2 py-2 text-sm text-[#6b7c72] hover:text-[#4a9d7c] transition-colors"
              data-testid="explore-network-toggle"
            >
              <span>Explore serving network</span>
              {showNetwork ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
            
            {showNetwork && (
              <div className="mt-3 animate-in slide-in-from-bottom-2 duration-200">
                <NetworkVisualization nodes={allNodes} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
