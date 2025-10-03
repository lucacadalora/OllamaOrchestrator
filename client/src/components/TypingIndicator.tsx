export function TypingIndicator() {
  return (
    <div className="flex items-center space-x-1">
      <span className="typing-dot" style={{ animationDelay: '0ms' }}>●</span>
      <span className="typing-dot" style={{ animationDelay: '150ms' }}>●</span>
      <span className="typing-dot" style={{ animationDelay: '300ms' }}>●</span>
    </div>
  );
}