import { useState } from "react";
import { ChevronDown, ChevronRight, Brain } from "lucide-react";
import { StreamingMessage } from "./StreamingMessage";
import { MessageContent } from "./MessageContent";

interface ReasoningDisplayProps {
  reasoning: string;
  isStreaming?: boolean;
  className?: string;
}

export function ReasoningDisplay({ reasoning, isStreaming = false, className }: ReasoningDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!reasoning) return null;

  return (
    <div className={`mb-4 border border-border rounded-lg overflow-hidden ${className || ''}`} data-testid="reasoning-container">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 transition-colors text-left"
        data-testid="button-toggle-reasoning"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4" data-testid="icon-chevron-down" />
        ) : (
          <ChevronRight className="w-4 h-4" data-testid="icon-chevron-right" />
        )}
        <Brain className="w-4 h-4" data-testid="icon-brain" />
        <span className="font-medium text-sm">Thinking Process</span>
        {isStreaming && (
          <span className="ml-auto text-xs text-muted-foreground" data-testid="text-streaming-indicator">
            Streaming...
          </span>
        )}
      </button>
      
      {isExpanded && (
        <div className="p-4 bg-background" data-testid="reasoning-content">
          {isStreaming ? (
            <StreamingMessage
              content={reasoning}
              isStreaming={true}
              className="text-muted-foreground"
            />
          ) : (
            <MessageContent content={reasoning} className="text-muted-foreground" />
          )}
        </div>
      )}
    </div>
  );
}
