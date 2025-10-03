import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Bot, Send, User, Cpu, Loader2, Wifi, WifiOff } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useWebSocketChat } from "@/hooks/useWebSocketChat";
import { MessageContent } from "@/components/MessageContent";
import { StreamingMessage } from "@/components/StreamingMessage";
import { ReasoningDisplay } from "@/components/ReasoningDisplay";
import { TypingIndicator } from "@/components/TypingIndicator";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string;
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

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [httpStreamingMessageId, setHttpStreamingMessageId] = useState<string | null>(null);
  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const lastAssistantMessageIdRef = useRef<string | null>(null);

  const handleStreamComplete = useCallback((finalContent: string, finalReasoning?: string) => {
    if (lastAssistantMessageIdRef.current) {
      setMessages(prev => prev.map(msg =>
        msg.id === lastAssistantMessageIdRef.current
          ? { ...msg, content: finalContent, reasoning: finalReasoning }
          : msg
      ));
    }
    setTimeout(() => {
      lastAssistantMessageIdRef.current = null;
    }, 0);
  }, []);

  const { isConnected, sendMessage: sendWebSocketMessage, currentResponse, currentReasoning, isStreaming } = useWebSocketChat(handleStreamComplete);

  // Fetch available models
  const { data: modelsData, isLoading: loadingModels } = useQuery<ModelsResponse>({
    queryKey: ["/api/v1/models"],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Set default model when data loads
  useEffect(() => {
    if (modelsData?.models && modelsData.models.length > 0 && !selectedModel) {
      setSelectedModel(modelsData.models[0].model);
    }
  }, [modelsData, selectedModel]);

  // Poll for streaming response
  const pollForResponse = async (requestId: string, messageId: string) => {
    const maxAttempts = 600; // 5 minutes (600 * 500ms)
    let attempts = 0;
    
    // Set streaming state for HTTP
    setHttpStreamingMessageId(messageId);
    
    while (attempts < maxAttempts) {
      try {
        const response = await fetch(`/api/v1/inference/status/${requestId}`);
        const data = await response.json();
        
        if (data.response) {
          // Update message with current response
          setMessages(prev => prev.map(msg =>
            msg.id === messageId
              ? { ...msg, content: data.response, nodeId: data.nodeId }
              : msg
          ));
        }
        
        if (data.done) {
          // Clear streaming state
          setHttpStreamingMessageId(null);
          
          if (data.error) {
            toast({
              title: "Inference Error",
              description: data.error,
              variant: "destructive",
            });
          }
          break;
        }
        
        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
      } catch (error) {
        console.error("Polling error:", error);
        setHttpStreamingMessageId(null);
        break;
      }
    }
  };

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await apiRequest("POST", "/api/v1/inference/chat", {
        model: selectedModel,
        messages: [
          ...messages.map(m => ({ role: m.role, content: m.content })),
          { role: "user", content: message }
        ],
      });
      return response.json();
    },
    onSuccess: async (data) => {
      // Add placeholder assistant message
      const assistantMessageId = `msg-${Date.now()}-assistant`;
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: "...",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
      
      // Start polling for streaming response
      if (data.requestId) {
        await pollForResponse(data.requestId, assistantMessageId);
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    },
  });

  const handleSend = () => {
    if (!input.trim() || !selectedModel) return;

    // Add user message
    const userMessage: Message = {
      id: `msg-${Date.now()}-user`,
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    
    // Try WebSocket first, fall back to HTTP if not connected
    const allMessages = [...messages.map(m => ({ role: m.role, content: m.content })), { role: "user", content: input.trim() }];
    const sentViaWebSocket = sendWebSocketMessage(selectedModel, allMessages);
    
    if (!sentViaWebSocket) {
      // Fallback to HTTP polling
      sendMutation.mutate(input.trim());
    } else {
      // Add placeholder for WebSocket streaming
      const assistantMessageId = `msg-${Date.now()}-assistant`;
      lastAssistantMessageIdRef.current = assistantMessageId;
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
    }
    
    // Clear input
    setInput("");
  };

  // Update tracked assistant message when WebSocket streams
  useEffect(() => {
    if ((currentResponse || currentReasoning) && lastAssistantMessageIdRef.current) {
      setMessages(prev => prev.map(msg =>
        msg.id === lastAssistantMessageIdRef.current
          ? { ...msg, content: currentResponse, reasoning: currentReasoning }
          : msg
      ));
    }
  }, [currentResponse, currentReasoning]);

  // Auto scroll to bottom with smooth animation
  useEffect(() => {
    if (scrollAreaRef.current) {
      // Use requestAnimationFrame for smoother scrolling
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

  return (
    <div className="flex flex-col lg:flex-row h-full min-h-screen" data-testid="chat-page">
      {/* Sidebar - Model Selection */}
      <div className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-border bg-card overflow-y-auto max-h-[40vh] lg:max-h-none lg:h-full">
        <div className="p-4">
          <h3 className="text-lg font-semibold mb-4">Available Models</h3>
          
          {loadingModels ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : models.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">No models available</p>
              <p className="text-xs text-muted-foreground mt-2">
                Connect nodes with Ollama to enable chat
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {models.map((model) => (
                <Card
                  key={model.model}
                  className={`cursor-pointer transition-colors ${
                    selectedModel === model.model
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  }`}
                  onClick={() => setSelectedModel(model.model)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Bot className="w-4 h-4 text-primary" />
                        <span className="font-medium">{model.model}</span>
                      </div>
                      <Badge variant="secondary">
                        {model.nodeCount} node{model.nodeCount !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground">
                        Available on: {model.nodes.slice(0, 2).join(", ")}
                        {model.nodes.length > 2 && ` +${model.nodes.length - 2} more`}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold">AI Chat</h2>
              <p className="text-muted-foreground">
                {selectedModel ? (
                  <span className="flex items-center gap-2">
                    Using <Badge variant="outline">{selectedModel}</Badge>
                    on distributed nodes
                    {isConnected ? (
                      <Badge variant="default" className="bg-green-600">
                        <Wifi className="w-3 h-3 mr-1" />
                        WebSocket
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <WifiOff className="w-3 h-3 mr-1" />
                        HTTP Polling
                      </Badge>
                    )}
                  </span>
                ) : (
                  "Select a model to start chatting"
                )}
              </p>
            </div>
            {messages.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMessages([])}
              >
                Clear Chat
              </Button>
            )}
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full p-6 smooth-scroll" ref={scrollAreaRef}>
            {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Bot className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Start a conversation</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Select a model and send a message to begin. Your requests will be
                routed to available nodes running Ollama.
              </p>
            </div>
          ) : (
            <div className="space-y-4 max-w-3xl mx-auto">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${
                    message.role === "user" ? "justify-end" : ""
                  }`}
                >
                  {message.role === "assistant" && (
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-5 h-5 text-primary" />
                    </div>
                  )}
                  <div className={`max-w-[70%] ${message.role === "user" ? "" : "space-y-2"}`}>
                    {message.role === "assistant" && message.reasoning && (
                      <ReasoningDisplay
                        reasoning={message.id === lastAssistantMessageIdRef.current ? currentReasoning : message.reasoning}
                        isStreaming={isStreaming && message.id === lastAssistantMessageIdRef.current && !!currentReasoning}
                      />
                    )}
                    {message.role === "assistant" && isStreaming && message.id === lastAssistantMessageIdRef.current && currentReasoning && !message.reasoning && (
                      <ReasoningDisplay
                        reasoning={currentReasoning}
                        isStreaming={true}
                      />
                    )}
                    <div
                      className={`rounded-lg px-4 py-2 ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      {message.role === "user" ? (
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      ) : (
                        <StreamingMessage 
                          content={message.content} 
                          isStreaming={(isStreaming && message.id === lastAssistantMessageIdRef.current) || (message.id === httpStreamingMessageId)}
                          isWaitingForResponse={!message.content && (message.id === lastAssistantMessageIdRef.current || message.id === httpStreamingMessageId)}
                          className="text-sm" 
                        />
                      )}
                      {message.nodeId && (
                        <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/20">
                          <Cpu className="w-3 h-3" />
                          <span className="text-xs opacity-70">
                            Node: {message.nodeId}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  {message.role === "user" && (
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                </div>
              ))}
              {sendMutation.isPending && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-5 h-5 text-primary" />
                  </div>
                  <div className="rounded-lg px-4 py-2 bg-muted">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          )}
          </ScrollArea>
        </div>

        {/* Input Area */}
        <div className="border-t border-border bg-card p-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSend()}
                placeholder={
                  selectedModel
                    ? "Type your message..."
                    : "Select a model first..."
                }
                disabled={!selectedModel || sendMutation.isPending}
                className="flex-1 px-4 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                data-testid="chat-input"
              />
              <Button
                onClick={handleSend}
                disabled={!selectedModel || !input.trim() || sendMutation.isPending}
                data-testid="send-button"
              >
                {sendMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Messages are routed to nodes running Ollama. Each request generates a receipt for tracking.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}