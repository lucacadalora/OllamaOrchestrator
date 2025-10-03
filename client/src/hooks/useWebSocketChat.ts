import { useState, useEffect, useRef, useCallback } from "react";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  nodeId?: string;
}

export function useWebSocketChat(onStreamComplete?: (content: string) => void) {
  const [isConnected, setIsConnected] = useState(false);
  const [currentResponse, setCurrentResponse] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const onStreamCompleteRef = useRef(onStreamComplete);

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

        if (data.type === "chunk" || data.type === "stream_chunk") {
          setCurrentResponse(prev => {
            const newContent = prev + data.chunk;
            
            if (data.done) {
              setIsStreaming(false);
              if (onStreamCompleteRef.current) {
                onStreamCompleteRef.current(newContent);
              }
              return newContent;
            }
            
            setIsStreaming(true);
            return newContent;
          });
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

  const sendMessage = useCallback((model: string, messages: Array<{ role: string; content: string }>) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      // Fallback to HTTP if WebSocket not connected
      return null;
    }

    setIsStreaming(true);
    setCurrentResponse("");

    wsRef.current.send(JSON.stringify({
      type: "inference_request",
      model,
      messages
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
    isStreaming
  };
}