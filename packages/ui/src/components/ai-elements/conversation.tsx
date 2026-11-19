/**
 * AI Elements — Conversation
 *
 * Adapted from the shadcn/ui "AI Elements" conversation primitive for this
 * repository: the scroll model is the host's existing `useAutoScroll` hook, so
 * the chat keeps its "follow while the answer streams, stop following as soon
 * as the reader scrolls up" behaviour (including the jump-to-bottom affordance).
 *
 * API stays compatible with the upstream component:
 *   <Conversation>
 *     <ConversationContent>…</ConversationContent>
 *     <ConversationScrollButton />
 *   </Conversation>
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { ArrowDown } from "@kn/icon";

import { Button } from "../ui/button";
import { useAutoScroll } from "../../hooks/use-auto-scroll";
import { cn } from "../../lib/utils";

type ConversationContextValue = {
  isAtBottom: boolean;
  scrollToBottom: () => void;
  disableAutoScroll: () => void;
  scrollRef: React.RefObject<HTMLDivElement>;
};

const ConversationContext = createContext<ConversationContextValue | null>(null);

export const useConversation = () => {
  const context = useContext(ConversationContext);
  if (!context) {
    throw new Error("Conversation components must be used within Conversation");
  }
  return context;
};

export type ConversationProps = HTMLAttributes<HTMLDivElement>;

export const Conversation = ({ className, children, ...props }: ConversationProps) => {
  const { scrollRef, isAtBottom, scrollToBottom, disableAutoScroll } = useAutoScroll({
    // The hook re-runs its follow logic whenever this node changes. Passing the
    // rendered children (as ChatMessageList did) keeps that behaviour.
    content: children,
  });

  const value = useMemo<ConversationContextValue>(
    () => ({
      scrollRef,
      isAtBottom,
      scrollToBottom,
      disableAutoScroll,
    }),
    [scrollRef, isAtBottom, scrollToBottom, disableAutoScroll],
  );

  return (
    <ConversationContext.Provider value={value}>
      <div
        role="log"
        className={cn("relative flex min-h-0 w-full flex-1 flex-col overflow-hidden", className)}
        {...props}
      >
        {children}
      </div>
    </ConversationContext.Provider>
  );
};

export type ConversationContentProps = HTMLAttributes<HTMLDivElement>;

export const ConversationContent = ({ className, ...props }: ConversationContentProps) => {
  const { scrollRef, disableAutoScroll } = useConversation();

  return (
    <div
      ref={scrollRef}
      onWheel={disableAutoScroll}
      onTouchMove={disableAutoScroll}
      className={cn("min-h-0 flex-1 overflow-y-auto overflow-x-hidden", className)}
      {...props}
    />
  );
};

export type ConversationEmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  title?: string;
  description?: string;
  icon?: ReactNode;
};

export const ConversationEmptyState = ({
  className,
  title = "No messages yet",
  description = "Start a conversation to see messages here",
  icon,
  children,
  ...props
}: ConversationEmptyStateProps) => (
  <div
    className={cn(
      "flex size-full flex-col items-center justify-center gap-3 p-8 text-center",
      className,
    )}
    {...props}
  >
    {children ?? (
      <>
        {icon && <div className="text-muted-foreground">{icon}</div>}
        <div className="space-y-1">
          <h3 className="text-sm font-medium">{title}</h3>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </>
    )}
  </div>
);

export type ConversationScrollButtonProps = React.ComponentProps<typeof Button> & {
  /** Localized accessible label for the jump-to-bottom affordance. */
  label?: string;
};

export const ConversationScrollButton = ({
  className,
  label,
  ...props
}: ConversationScrollButtonProps) => {
  const { isAtBottom, scrollToBottom } = useConversation();

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  if (isAtBottom) return null;

  return (
    <Button
      className={cn(
        "absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full shadow-md",
        className,
      )}
      onClick={handleScrollToBottom}
      size="icon"
      type="button"
      variant="outline"
      aria-label={label ?? "Scroll to bottom"}
      {...props}
    >
      <ArrowDown className="size-4" />
    </Button>
  );
};

Conversation.displayName = "Conversation";
ConversationContent.displayName = "ConversationContent";
ConversationEmptyState.displayName = "ConversationEmptyState";
ConversationScrollButton.displayName = "ConversationScrollButton";