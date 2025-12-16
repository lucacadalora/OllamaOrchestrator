import { useState, useCallback, useRef } from 'react';

interface StreamingState {
  isStreaming: boolean;
  currentResponse: string;
  currentReasoning: string;
  error: string | null;
}

interface StreamOptions {
  think?: boolean;
}

export function useStreamingChat() {
  const [state, setState] = useState<StreamingState>({
    isStreaming: false,
    currentResponse: '',
    currentReasoning: '',
    error: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (
    model: string,
    messages: Array<{ role: string; content: string }>,
    options?: StreamOptions,
    onToken?: (content: string, contentType: 'response' | 'reasoning') => void,
    onComplete?: (fullResponse: string, fullReasoning: string) => void,
    onError?: (error: string) => void
  ): Promise<boolean> => {
    // Abort any existing stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    setState({
      isStreaming: true,
      currentResponse: '',
      currentReasoning: '',
      error: null,
    });

    let fullResponse = '';
    let fullReasoning = '';

    try {
      const response = await fetch('/api/v1/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages, options }),
        signal: abortControllerRef.current.signal,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Stream failed' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const data = line.slice(6);
          if (data === '[DONE]') {
            setState(prev => ({ ...prev, isStreaming: false }));
            onComplete?.(fullResponse, fullReasoning);
            return true;
          }

          try {
            const json = JSON.parse(data);

            if (json.type === 'delta') {
              if (json.contentType === 'reasoning') {
                fullReasoning += json.delta;
                setState(prev => ({
                  ...prev,
                  currentReasoning: prev.currentReasoning + json.delta,
                }));
                onToken?.(json.delta, 'reasoning');
              } else {
                fullResponse += json.delta;
                setState(prev => ({
                  ...prev,
                  currentResponse: prev.currentResponse + json.delta,
                }));
                onToken?.(json.delta, 'response');
              }
            } else if (json.type === 'error') {
              throw new Error(json.error);
            } else if (json.type === 'done') {
              setState(prev => ({ ...prev, isStreaming: false }));
              onComplete?.(fullResponse, fullReasoning);
              return true;
            }
          } catch (parseError) {
            // Skip invalid JSON lines
          }
        }
      }

      setState(prev => ({ ...prev, isStreaming: false }));
      onComplete?.(fullResponse, fullReasoning);
      return true;

    } catch (error: any) {
      if (error.name === 'AbortError') {
        setState(prev => ({ ...prev, isStreaming: false }));
        return false;
      }

      const errorMessage = error.message || 'Streaming failed';
      setState({
        isStreaming: false,
        currentResponse: '',
        currentReasoning: '',
        error: errorMessage,
      });
      onError?.(errorMessage);
      return false;
    }
  }, []);

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState(prev => ({ ...prev, isStreaming: false }));
  }, []);

  const reset = useCallback(() => {
    setState({
      isStreaming: false,
      currentResponse: '',
      currentReasoning: '',
      error: null,
    });
  }, []);

  return {
    ...state,
    sendMessage,
    abort,
    reset,
  };
}
