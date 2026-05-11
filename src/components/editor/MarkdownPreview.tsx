"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTheme } from "@/lib/theme";

interface MarkdownPreviewProps {
  content: string;
}

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className="px-6 py-4">
      <div
        className={[
          "prose prose-sm max-w-none",
          isDark
            ? [
                "prose-invert",
                "prose-headings:text-gray-100 prose-headings:font-semibold",
                "prose-p:text-gray-300 prose-p:leading-relaxed",
                "prose-strong:text-white",
                "prose-code:text-indigo-300 prose-code:bg-white/8 prose-code:px-1 prose-code:rounded prose-code:text-xs prose-code:font-mono",
                "prose-pre:bg-white/5 prose-pre:border prose-pre:border-white/10",
                "prose-blockquote:border-indigo-500 prose-blockquote:text-gray-400",
                "prose-a:text-indigo-400 hover:prose-a:text-indigo-300",
                "prose-li:text-gray-300",
                "prose-hr:border-white/10",
                "prose-th:text-gray-200 prose-td:text-gray-300",
              ].join(" ")
            : [
                "prose-stone",
                "prose-headings:text-stone-900 prose-headings:font-semibold",
                "prose-p:text-stone-700 prose-p:leading-relaxed",
                "prose-strong:text-stone-900",
                "prose-code:text-indigo-600 prose-code:bg-indigo-50 prose-code:px-1 prose-code:rounded prose-code:text-xs prose-code:font-mono",
                "prose-pre:bg-stone-100 prose-pre:border prose-pre:border-stone-200",
                "prose-blockquote:border-indigo-400 prose-blockquote:text-stone-500",
                "prose-a:text-indigo-600 hover:prose-a:text-indigo-500",
                "prose-li:text-stone-700",
                "prose-hr:border-stone-200",
                "prose-th:text-stone-800 prose-td:text-stone-700",
              ].join(" "),
        ].join(" ")}
      >
        {content ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        ) : (
          <p style={{ color: "var(--app-text-faint)" }} className="italic">
            Nada que previsualizar...
          </p>
        )}
      </div>
    </div>
  );
}
