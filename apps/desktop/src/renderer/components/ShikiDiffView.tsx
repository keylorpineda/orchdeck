import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  createHighlighterCore,
  type HighlighterCore,
  type LanguageInput,
  type ThemedToken,
  type ThemeRegistration,
} from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { detectShikiLang, parseDiffLines } from '../state/change-card-utils';
import type { InlineDiffComment } from '../state/inline-comments';
import { useTheme } from './ThemeProvider';

const SUPPORTED_LANG_LOADERS: Readonly<Record<string, () => Promise<{ default: LanguageInput } | LanguageInput>>> = {
  typescript: () => import('shiki/langs/typescript.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  javascript: () => import('shiki/langs/javascript.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
  bash: () => import('shiki/langs/bash.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
};

const PAPER_INK_THEME: ThemeRegistration = {
  name: 'orchdeck-paper-ink',
  type: 'light',
  colors: {
    'editor.background': '#FCFBF8',
    'editor.foreground': '#1B1916',
  },
  tokenColors: [
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: '#8C8478', fontStyle: 'italic' } },
    { scope: ['keyword', 'storage', 'keyword.control'], settings: { foreground: '#A93B22' } },
    { scope: ['string', 'constant.other.symbol'], settings: { foreground: '#266644' } },
    { scope: ['constant.numeric', 'constant.language'], settings: { foreground: '#9E6319' } },
    { scope: ['entity.name.type', 'support.type', 'entity.name.function'], settings: { foreground: '#55698F' } },
    { scope: ['variable', 'identifier', 'meta.object-literal.key'], settings: { foreground: '#1B1916' } },
  ],
};

const GRAPHITE_VERMILION_THEME: ThemeRegistration = {
  name: 'orchdeck-graphite-vermilion',
  type: 'dark',
  colors: {
    'editor.background': '#1D1B18',
    'editor.foreground': '#ECE8E0',
  },
  tokenColors: [
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: '#6E685E', fontStyle: 'italic' } },
    { scope: ['keyword', 'storage', 'keyword.control'], settings: { foreground: '#DF684B' } },
    { scope: ['string', 'constant.other.symbol'], settings: { foreground: '#63B888' } },
    { scope: ['constant.numeric', 'constant.language'], settings: { foreground: '#D99A46' } },
    { scope: ['entity.name.type', 'support.type', 'entity.name.function'], settings: { foreground: '#8EA4CC' } },
    { scope: ['variable', 'identifier', 'meta.object-literal.key'], settings: { foreground: '#ECE8E0' } },
  ],
};

let highlighterPromise: Promise<HighlighterCore> | null = null;
const loadedLanguages = new Set<string>();

async function getDiffHighlighter(lang: string): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [PAPER_INK_THEME, GRAPHITE_VERMILION_THEME],
      langs: [],
      engine: createJavaScriptRegexEngine(),
    });
  }

  const highlighter = await highlighterPromise;
  const loader = SUPPORTED_LANG_LOADERS[lang];
  if (lang !== 'text' && !loadedLanguages.has(lang) && loader) {
    const mod = await loader();
    await highlighter.loadLanguage('default' in mod ? mod.default : mod);
    loadedLanguages.add(lang);
  }
  return highlighter;
}

export interface ShikiDiffViewProps {
  readonly filePath: string;
  readonly diff: string;
  readonly isBinary: boolean;
  readonly comments?: readonly InlineDiffComment[] | undefined;
  readonly onAddComment?: ((comment: Omit<InlineDiffComment, 'id'>) => void) | undefined;
  readonly onRemoveComment?: ((commentId: string) => void) | undefined;
}

export function ShikiDiffView({
  filePath,
  diff,
  isBinary,
  comments = [],
  onAddComment,
  onRemoveComment,
}: ShikiDiffViewProps) {
  const { theme } = useTheme();
  const parsedLines = useMemo(() => parseDiffLines(diff), [diff]);
  const [tokenLines, setTokenLines] = useState<readonly (readonly ThemedToken[])[] | null>(null);
  const [draftTarget, setDraftTarget] = useState<{
    readonly lineNumber: number;
    readonly side: 'new' | 'old';
  } | null>(null);
  const [draftBody, setDraftBody] = useState('');

  const lang = useMemo(() => detectShikiLang(filePath), [filePath]);
  const themeName = theme === 'dark' ? 'orchdeck-graphite-vermilion' : 'orchdeck-paper-ink';

  const codeEntries = useMemo(
    () =>
      parsedLines
        .map((line, index) => ({ index, line }))
        .filter(
          (entry) =>
            entry.line.kind === 'add' || entry.line.kind === 'del' || entry.line.kind === 'context',
        ),
    [parsedLines],
  );

  useEffect(() => {
    if (isBinary || codeEntries.length === 0 || lang === 'text' || !(lang in SUPPORTED_LANG_LOADERS)) {
      setTokenLines(null);
      return;
    }

    let cancelled = false;
    const joinedCode = codeEntries.map((entry) => entry.line.code).join('\n');

    void getDiffHighlighter(lang)
      .then((highlighter) => {
        if (cancelled) {
          return;
        }
        const tokenized = highlighter.codeToTokens(joinedCode, {
          lang,
          theme: themeName,
        });
        setTokenLines(tokenized.tokens);
      })
      .catch(() => {
        if (!cancelled) {
          setTokenLines(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [codeEntries, isBinary, lang, themeName]);

  if (isBinary) {
    return (
      <div className="tabular-mono border-t border-border-subtle bg-inset px-3 py-2 text-[11.5px] text-ink-tertiary">
        Binary file diff omitted.
      </div>
    );
  }

  if (parsedLines.length === 0) {
    return (
      <div className="tabular-mono border-t border-border-subtle bg-inset px-3 py-2 text-[11.5px] text-ink-tertiary">
        No textual diff available.
      </div>
    );
  }

  const lineTokenMap = new Map<number, readonly ThemedToken[]>();
  if (tokenLines) {
    codeEntries.forEach((entry, codeIdx) => {
      const tokens = tokenLines[codeIdx];
      if (tokens) {
        lineTokenMap.set(entry.index, tokens);
      }
    });
  }

  return (
    <div className="overflow-x-auto border-t border-border-subtle bg-surface">
      <table className="tabular-mono w-full border-collapse text-[11.5px] leading-[1.45]">
        <tbody>
          {parsedLines.map((line, index) => {
            if (line.kind === 'meta' || line.kind === 'hunk') {
              return (
                <tr key={index} className="bg-inset text-ink-tertiary">
                  <td className="w-[40px] select-none px-2 py-0.5 text-right opacity-70" />
                  <td className="w-[40px] select-none px-2 py-0.5 text-right opacity-70" />
                  <td className="w-[18px] select-none px-1 py-0.5 text-center" />
                  <td className="whitespace-pre px-2 py-0.5">{line.code}</td>
                </tr>
              );
            }

            const rowClasses =
              line.kind === 'add'
                ? 'bg-pass-bg text-ink'
                : line.kind === 'del'
                  ? 'bg-fail-bg text-ink'
                  : 'text-ink-secondary';

            const prefixClass =
              line.kind === 'add'
                ? 'text-pass font-medium'
                : line.kind === 'del'
                  ? 'text-fail font-medium'
                  : 'text-ink-tertiary';

            const tokens = lineTokenMap.get(index);
            const targetLineNumber = line.newLine ?? line.oldLine;
            const targetSide: 'new' | 'old' = line.newLine !== null ? 'new' : 'old';
            const lineComments =
              targetLineNumber !== null
                ? comments.filter(
                    (c) =>
                      c.filePath === filePath &&
                      c.lineNumber === targetLineNumber &&
                      c.side === targetSide,
                  )
                : [];
            const isDrafting =
              draftTarget !== null &&
              targetLineNumber !== null &&
              draftTarget.lineNumber === targetLineNumber &&
              draftTarget.side === targetSide;

            return (
              <Fragment key={index}>
                <tr className={rowClasses}>
                  <td className="w-[40px] select-none border-r border-border-subtle px-2 py-0 text-right text-ink-tertiary">
                    {line.oldLine ?? ''}
                  </td>
                  <td className="w-[40px] select-none border-r border-border-subtle px-2 py-0 text-right text-ink-tertiary">
                    {onAddComment && targetLineNumber !== null ? (
                      <button
                        type="button"
                        onClick={() => {
                          setDraftTarget({ lineNumber: targetLineNumber, side: targetSide });
                          setDraftBody('');
                        }}
                        title={`Add inline review comment on line ${targetLineNumber}`}
                        className="w-full text-right hover:font-medium hover:text-accent"
                      >
                        {line.newLine ?? line.oldLine ?? ''}
                      </button>
                    ) : (
                      line.newLine ?? ''
                    )}
                  </td>
                  <td className={`w-[18px] select-none px-1 py-0 text-center ${prefixClass}`}>
                    {line.prefix}
                  </td>
                  <td className="whitespace-pre px-2 py-0">
                    {tokens ? (
                      tokens.map((token, tokenIdx) => (
                        <span
                          key={tokenIdx}
                          style={token.color ? { color: token.color } : undefined}
                        >
                          {token.content}
                        </span>
                      ))
                    ) : (
                      <span>{line.code}</span>
                    )}
                  </td>
                </tr>

                {lineComments.map((comment) => (
                  <tr key={comment.id} className="bg-warn-bg">
                    <td colSpan={4} className="border-y border-border-subtle px-3 py-1.5 text-[11.5px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-ink">
                          <span className="font-medium text-warn">
                            L{comment.lineNumber} ({comment.side}):
                          </span>{' '}
                          {comment.body}
                        </span>
                        {onRemoveComment ? (
                          <button
                            type="button"
                            onClick={() => onRemoveComment(comment.id)}
                            className="text-ink-tertiary hover:text-fail"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}

                {isDrafting && draftTarget && onAddComment ? (
                  <tr className="bg-inset">
                    <td colSpan={4} className="border-y border-border-subtle px-3 py-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={draftBody}
                          onChange={(e) => setDraftBody(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && draftBody.trim().length > 0) {
                              e.preventDefault();
                              onAddComment({
                                filePath,
                                lineNumber: draftTarget.lineNumber,
                                side: draftTarget.side,
                                body: draftBody.trim(),
                              });
                              setDraftTarget(null);
                              setDraftBody('');
                            } else if (e.key === 'Escape') {
                              setDraftTarget(null);
                            }
                          }}
                          placeholder={`Comment on L${draftTarget.lineNumber}...`}
                          className="flex-1 rounded-[4px] border border-border-strong bg-surface px-2 py-1 text-[11.5px] text-ink outline-none focus:border-accent"
                        />
                        <button
                          type="button"
                          disabled={draftBody.trim().length === 0}
                          onClick={() => {
                            onAddComment({
                              filePath,
                              lineNumber: draftTarget.lineNumber,
                              side: draftTarget.side,
                              body: draftBody.trim(),
                            });
                            setDraftTarget(null);
                            setDraftBody('');
                          }}
                          className="rounded-[4px] border border-accent bg-accent px-2 py-1 text-[11px] font-medium text-surface disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setDraftTarget(null)}
                          className="rounded-[4px] border border-border-subtle bg-surface px-2 py-1 text-[11px] text-ink-secondary"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
