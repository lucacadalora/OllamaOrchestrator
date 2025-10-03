import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { StreamingCursor } from './StreamingCursor';
import { TypingIndicator } from './TypingIndicator';
import 'katex/dist/katex.min.css';

interface StreamingMessageProps {
  content: string;
  isStreaming: boolean;
  isWaitingForResponse?: boolean;
  className?: string;
}

export function StreamingMessage({ 
  content, 
  isStreaming, 
  isWaitingForResponse = false,
  className 
}: StreamingMessageProps) {
  // If waiting for response, show typing indicator
  if (isWaitingForResponse && !content) {
    return (
      <div className={className}>
        <TypingIndicator />
      </div>
    );
  }

  // Handle incomplete code blocks during streaming
  const processContent = (text: string) => {
    if (!isStreaming) return text;

    // Count backticks to detect incomplete code blocks
    const backtickCount = (text.match(/```/g) || []).length;
    
    // If we have an odd number of triple backticks, we're in an incomplete code block
    if (backtickCount % 2 === 1) {
      // Add a closing backtick temporarily to prevent markdown parsing errors
      return text + '\n```';
    }

    // Check for incomplete inline code (single backticks)
    const singleBacktickCount = (text.match(/`/g) || []).length;
    if (singleBacktickCount % 2 === 1) {
      return text + '`';
    }

    return text;
  };

  const displayContent = processContent(content);

  return (
    <div className={`prose prose-sm max-w-none dark:prose-invert ${className || ''}`}>
      <div className={isStreaming ? 'streaming-text' : ''}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            // Code blocks with syntax highlighting
            code({ node, className: codeClassName, children, ...props }: any) {
              const match = /language-(\w+)/.exec(codeClassName || '');
              const inline = !match;
              
              // During streaming, skip syntax highlighting for incomplete blocks
              if (isStreaming && !inline) {
                const codeContent = String(children).replace(/\n$/, '');
                // Check if this might be an incomplete block
                if (codeContent.includes('```') || content.endsWith('```')) {
                  return (
                    <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 my-4 overflow-x-auto">
                      <code>{codeContent}</code>
                    </pre>
                  );
                }
              }

              return !inline ? (
                <SyntaxHighlighter
                  style={oneDark}
                  language={match[1]}
                  PreTag="div"
                  className="rounded-md overflow-x-auto"
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              ) : (
                <code 
                  className={`${inline ? 'px-1 py-0.5 rounded bg-muted text-sm' : ''} ${codeClassName || ''}`} 
                  {...props}
                >
                  {children}
                </code>
              );
            },
            // Tables with proper styling
            table({ children }) {
              return (
                <div className="overflow-x-auto my-4">
                  <table className="w-full border-collapse border border-border">
                    {children}
                  </table>
                </div>
              );
            },
            thead({ children }) {
              return <thead className="bg-muted">{children}</thead>;
            },
            th({ children, ...props }) {
              return (
                <th 
                  className="border border-border px-3 py-2 text-left font-semibold"
                  style={{ textAlign: (props as any).align || 'left' }}
                >
                  {children}
                </th>
              );
            },
            td({ children, ...props }) {
              return (
                <td 
                  className="border border-border px-3 py-2"
                  style={{ textAlign: (props as any).align || 'left' }}
                >
                  {children}
                </td>
              );
            },
            // Links with styling
            a({ href, children }) {
              return (
                <a 
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {children}
                </a>
              );
            },
            // Blockquotes with styling
            blockquote({ children }) {
              return (
                <blockquote className="border-l-4 border-primary pl-4 italic my-4">
                  {children}
                </blockquote>
              );
            },
            // Horizontal rules
            hr() {
              return <hr className="my-6 border-border" />;
            },
            // Lists
            ul({ children }) {
              return <ul className="list-disc pl-6 space-y-1 my-2">{children}</ul>;
            },
            ol({ children }) {
              return <ol className="list-decimal pl-6 space-y-1 my-2">{children}</ol>;
            },
            li({ children }) {
              return <li className="my-0.5">{children}</li>;
            },
            // Paragraphs
            p({ children }) {
              return <p className="my-2 leading-relaxed">{children}</p>;
            },
            // Headings
            h1({ children }) {
              return <h1 className="text-2xl font-bold mb-3 mt-4">{children}</h1>;
            },
            h2({ children }) {
              return <h2 className="text-xl font-bold mb-2 mt-3">{children}</h2>;
            },
            h3({ children }) {
              return <h3 className="text-lg font-semibold mb-2 mt-2">{children}</h3>;
            },
            h4({ children }) {
              return <h4 className="text-base font-semibold mb-1 mt-2">{children}</h4>;
            },
            h5({ children }) {
              return <h5 className="text-sm font-semibold mb-1">{children}</h5>;
            },
            h6({ children }) {
              return <h6 className="text-sm font-semibold mb-1">{children}</h6>;
            },
          }}
        >
          {displayContent}
        </ReactMarkdown>
      </div>
      {isStreaming && content && <StreamingCursor />}
    </div>
  );
}