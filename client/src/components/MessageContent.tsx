import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import 'katex/dist/katex.min.css';

interface MessageContentProps {
  content: string;
  className?: string;
}

export function MessageContent({ content, className }: MessageContentProps) {
  return (
    <div className={`prose prose-sm max-w-none dark:prose-invert ${className || ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // Code blocks with syntax highlighting
          code({ node, className: codeClassName, children, ...props }: any) {
            const match = /language-(\w+)/.exec(codeClassName || '');
            const inline = !match;
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
        a({ children, href }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline hover:opacity-80"
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
        // Horizontal rule
        hr() {
          return <hr className="my-4 border-border" />;
        },
        // Lists with proper spacing
        ul({ children }) {
          return <ul className="list-disc pl-6 space-y-1">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="list-decimal pl-6 space-y-1">{children}</ol>;
        },
        // Paragraphs with spacing
        p({ children }) {
          return <p className="mb-4 last:mb-0">{children}</p>;
        },
        // Headings with appropriate sizing
        h1({ children }) {
          return <h1 className="text-2xl font-bold mb-4">{children}</h1>;
        },
        h2({ children }) {
          return <h2 className="text-xl font-bold mb-3">{children}</h2>;
        },
        h3({ children }) {
          return <h3 className="text-lg font-semibold mb-2">{children}</h3>;
        },
        h4({ children }) {
          return <h4 className="text-base font-semibold mb-2">{children}</h4>;
        },
        h5({ children }) {
          return <h5 className="text-sm font-semibold mb-1">{children}</h5>;
        },
        h6({ children }) {
          return <h6 className="text-sm font-semibold mb-1">{children}</h6>;
        },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}