import { useState, useEffect, useRef, useCallback } from "react";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  nodeId?: string;
}

export function useWebSocketChat(onStreamComplete?: (content: string, reasoning?: string) => void) {
  const [isConnected, setIsConnected] = useState(false);
  const [currentResponse, setCurrentResponse] = useState("");
  const [currentReasoning, setCurrentReasoning] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [offset, setOffset] = useState(0); // Track cursor position
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const onStreamCompleteRef = useRef(onStreamComplete);
  const updateTimeoutRef = useRef<NodeJS.Timeout>();
  const offsetRef = useRef(0); // Ref for immediate access

  useEffect(() => {
    onStreamCompleteRef.current = onStreamComplete;
  }, [onStreamComplete]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const ws = new WebSocket(`${protocol}//${host}/api/ws?session=${sessionId}`);

    ws.onopen = () => {
      console.log("WebSocket connected");
      setIsConnected(true);
      clearTimeout(reconnectTimeoutRef.current);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Handle delta-based streaming (new contract)
        if (data.delta !== undefined) {
          const contentType = data.contentType || "response";
          
          // Only apply delta if offset matches
          if (data.offset === offsetRef.current) {
            // Update appropriate content based on type
            if (contentType === "reasoning") {
              setCurrentReasoning(prev => prev + data.delta);
            } else {
              setCurrentResponse(prev => prev + data.delta);
            }
            
            const newOffset = offsetRef.current + [...data.delta].length;
            setOffset(newOffset);
            offsetRef.current = newOffset;
            
            if (data.done) {
              setIsStreaming(false);
              setTimeout(() => {
                if (onStreamCompleteRef.current) {
                  onStreamCompleteRef.current(currentResponse, currentReasoning);
                }
              }, 50);
            } else {
              setIsStreaming(true);
            }
          }
          // Ignore out-of-order deltas
        } 
        // Legacy chunk handling (backwards compatibility)
        else if (data.type === "chunk" || data.type === "stream_chunk") {
          const contentType = data.contentType || "response";
          
          // Clear any existing debounce timer
          if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current);
          }
          
          // Debounce updates for smoother rendering with larger chunks
          updateTimeoutRef.current = setTimeout(() => {
            if (contentType === "reasoning") {
              setCurrentReasoning(prev => prev + (data.chunk || ''));
            } else {
              setCurrentResponse(prev => {
                // Ensure we're always appending to the latest state
                const newContent = prev + (data.chunk || '');
                
                if (data.done) {
                  setIsStreaming(false);
                  // Small delay to ensure final state is set
                  setTimeout(() => {
                    if (onStreamCompleteRef.current) {
                      onStreamCompleteRef.current(newContent, currentReasoning);
                    }
                  }, 50);
                  return newContent;
                }
                
                setIsStreaming(true);
                return newContent;
              });
            }
          }, 30); // 30ms debounce for smooth updates
        } else if (data.type === "request_created") {
          console.log("Request created:", data.requestId);
        } else if (data.type === "error") {
          console.error("WebSocket error:", data.error);
        }
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      setIsConnected(false);
      wsRef.current = null;
      
      // Reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    wsRef.current = ws;
  }, []);

  const sendMessage = useCallback((model: string, messages: Array<{ role: string; content: string }>, options?: { think?: boolean }) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      // Fallback to HTTP if WebSocket not connected
      return null;
    }

    setIsStreaming(true);
    setCurrentResponse("");
    setCurrentReasoning("");
    setOffset(0);  // Reset offset for new message
    offsetRef.current = 0;

    wsRef.current.send(JSON.stringify({
      type: "inference_request",
      model,
      messages,
      options
    }));

    return true; // Indicate WebSocket was used
  }, []);

  // Connect on mount
  useEffect(() => {
    connect();

    return () => {
      clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    isConnected,
    sendMessage,
    currentResponse,
    currentReasoning,
    isStreaming
  };
}