/**
 * AI Elements — Code Block
 *
 * Lightweight adaptation: the upstream component highlights with Shiki, but the
 * chat already renders fenced code through Streamdown. Tool payloads need a
 * compact, dependency-free block, so this keeps the same public surface
 * (`CodeBlock`, `CodeBlockCopyButton`) without the highlighting runtime.
 */

import React, {
  createContext,
  useContext,
  useState,
  type ComponentProps,
  type HTMLAttributes,
} from "react";

import { Check, Copy } from "@kn/icon";

import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

type CodeBlockProps = HTMLAttributes<HTMLDivElement> & {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
};

type CodeBlockContextType = {
  code: string;
};

const CodeBlockContext = createContext<CodeBlockContextType>({ code: "" });

export const CodeBlock = ({
  code,
  language = "text",
  showLineNumbers = false,
  className,
  children,
  ...props
}: CodeBlockProps) => {
  const lines = code.split("\n");

  return (
    <CodeBlockContext.Provider value={{ code }}>
      <div
        className={cn(
          "group relative w-full overflow-hidden rounded-md border bg-background text-foreground",
          className,
        )}
        {...props}
      >
        <div className="relative">
          <pre className="m-0 overflow-auto bg-background p-3 text-xs leading-relaxed">
            <code className={`language-${language} font-mono`}>
              {showLineNumbers
                ? lines.map((line, index) => (
                    <span key={index} className="block">
                      <span className="mr-4 inline-block min-w-8 select-none text-right text-muted-foreground">
                        {index + 1}
                      </span>
                      {line}
                    </span>
                  ))
                : code}
            </code>
          </pre>
          {children && (
            <div className="absolute right-2 top-2 flex items-center gap-2">{children}</div>
          )}
        </div>
      </div>
    </CodeBlockContext.Provider>
  );
};

export type CodeBlockCopyButtonProps = ComponentProps<typeof Button> & {
  onCopy?: () => void;
  onError?: (error: Error) => void;
  timeout?: number;
};

export const CodeBlockCopyButton = ({
  onCopy,
  onError,
  timeout = 2000,
  children,
  className,
  ...props
}: CodeBlockCopyButtonProps) => {
  const [isCopied, setIsCopied] = useState(false);
  const { code } = useContext(CodeBlockContext);

  const copyToClipboard = async () => {
    if (typeof window === "undefined" || !navigator?.clipboard?.writeText) {
      onError?.(new Error("Clipboard API not available"));
      return;
    }

    try {
      await navigator.clipboard.writeText(code);
      setIsCopied(true);
      onCopy?.();
      setTimeout(() => setIsCopied(false), timeout);
    } catch (error) {
      onError?.(error as Error);
    }
  };

  const Icon = isCopied ? Check : Copy;

  return (
    <Button
      className={cn("shrink-0", className)}
      onClick={copyToClipboard}
      size="icon-xs"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <Icon size={14} />}
    </Button>
  );
};