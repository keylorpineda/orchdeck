import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface MarkdownContentProps {
  readonly content: string;
}

function isSafeHttpsHref(href: string | undefined): boolean {
  if (!href) {
    return false;
  }
  try {
    const url = new URL(href);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <div className="max-w-[68ch] text-[14px] leading-[1.58] text-ink">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h2 className="mt-4 mb-2 text-[17px] font-semibold tracking-[-0.01em] text-ink">
              {children}
            </h2>
          ),
          h2: ({ children }) => (
            <h3 className="mt-4 mb-1.5 text-[15px] font-semibold text-ink">{children}</h3>
          ),
          h3: ({ children }) => (
            <h4 className="mt-3 mb-1 text-[14px] font-semibold text-ink">{children}</h4>
          ),
          p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="my-2 list-disc pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal pl-5">{children}</ol>,
          li: ({ children }) => <li className="my-0.5">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-2.5 border-l-2 border-border-strong pl-3 text-ink-secondary">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) =>
            isSafeHttpsHref(href) ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline decoration-border-strong underline-offset-2 hover:text-accent-hover"
              >
                {children}
              </a>
            ) : (
              <span className="text-ink-secondary">{children}</span>
            ),
          code: ({ className, children }) => {
            const isBlock = Boolean(className && className.startsWith('language-'));
            if (isBlock) {
              return (
                <code className="tabular-mono block overflow-x-auto rounded-[6px] border border-border-subtle bg-inset px-3 py-2.5 text-[12px] leading-[1.5] text-ink">
                  {children}
                </code>
              );
            }
            return (
              <code className="tabular-mono rounded-[4px] bg-inset px-1.5 py-0.5 text-[12px] text-ink">
                {children}
              </code>
            );
          },
          pre: ({ children }) => <pre className="my-2.5 overflow-x-auto">{children}</pre>,
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-[6px] border border-border-subtle">
              <table className="w-full border-collapse text-left text-[12.5px]">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-border-subtle bg-sidebar px-2.5 py-1.5 font-medium text-ink">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-border-subtle px-2.5 py-1.5 text-ink-secondary">
              {children}
            </td>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
