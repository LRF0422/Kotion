import React, { useRef, useState, useImperativeHandle, createContext, useContext } from "react";
import { X, MessageCircle, ArrowDown } from "@kn/icon";
import { cn } from "@ui/lib/utils";
import { Button } from "@ui/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { useAutoScroll } from "@ui/hooks/use-auto-scroll";
import { Textarea } from "./textarea";

// Context to share chat state with child components
interface ChatContextValue {
  isOpen: boolean;
  toggleChat: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

function useChatContext() {
  const context = useContext(ChatContext);
  return context;
}

export type ChatPosition = "bottom-right" | "bottom-left";
export type ChatSize = "sm" | "md" | "lg" | "xl" | "full";

// Configuration constants for the chat component
const CHAT_DIMENSIONS = {
  sm: "max-w-xs max-h-[50vh] min-h-[200px] w-[85vw] sm:w-[380px]",
  md: "max-w-md max-h-[65vh] min-h-[500px] w-[85vw] sm:w-[450px]",
  lg: "max-w-lg max-h-[70vh] min-h-[400px] w-[85vw] sm:w-[550px]",
  xl: "max-w-xl max-h-[80vh] min-h-[500px] w-[85vw] sm:w-[650px]",
  full: "w-full h-[90vh] max-w-full max-h-full sm:w-full sm:h-[90vh] sm:max-w-full sm:max-h-full",
} as const;

const CHAT_POSITIONS = {
  "bottom-right": "bottom-5 right-5",
  "bottom-left": "bottom-5 left-5",
} as const;

const CHAT_PANEL_POSITIONS = {
  "bottom-right": "absolute bottom-[calc(100%+10px)] right-0 top-auto left-auto",
  "bottom-left": "absolute bottom-[calc(100%+10px)] left-0 top-auto right-auto",
} as const;

const CHAT_VISIBILITY_STATES = {
  open: "pointer-events-auto opacity-100 visible scale-100 translate-y-0",
  closed: "pointer-events-none opacity-0 invisible scale-100 translate-y-5 absolute",
} as const;

interface ExpandableChatProps extends React.HTMLAttributes<HTMLDivElement> {
  position?: ChatPosition;
  size?: ChatSize;
  icon?: React.ReactNode;
}

const ExpandableChat: React.FC<ExpandableChatProps> = ({
  className,
  position = "bottom-right",
  size = "md",
  icon,
  children,
  ...props
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  const toggleChat = () => setIsOpen(!isOpen);

  // Close chat when pressing Escape key
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Focus management when chat opens/closes
  React.useEffect(() => {
    if (isOpen && chatRef.current) {
      // Focus the chat container when it opens for better accessibility
      chatRef.current.focus();
    }
  }, [isOpen]);

  return (
    <ChatContext.Provider value={{ isOpen, toggleChat }}>
      <div
        className={cn(`fixed ${CHAT_POSITIONS[position]} z-50`, className)}
        {...props}
      >
        <div className="relative">
          <div
            ref={chatRef}
            tabIndex={-1}
            className={cn(
              "flex flex-col bg-background border rounded-lg shadow-lg overflow-hidden transition-all duration-250 ease-in-out w-full max-h-[80vh] sm:max-h-[75vh]",
              CHAT_PANEL_POSITIONS[position],
              CHAT_DIMENSIONS[size],
              isOpen ? CHAT_VISIBILITY_STATES.open : CHAT_VISIBILITY_STATES.closed,
              className,
            )}
          >
            {children}
          </div>
        </div>
        <ExpandableChatToggle
          icon={icon}
          isOpen={isOpen}
          toggleChat={toggleChat}
        />
      </div>
    </ChatContext.Provider>
  );
};

ExpandableChat.displayName = "ExpandableChat";

const ExpandableChatHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => {
  const chatContext = useChatContext();
  return (
    <div
      className={cn("flex items-center justify-between p-3 border-b", className)}
      {...props}
    />
  );
};

ExpandableChatHeader.displayName = "ExpandableChatHeader";

const ExpandableChatBody: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => (
  <div
    className={cn(
      // Flex column so children (e.g. TeamStatusPanel + ChatMessageList) can
      // share the available height. The body itself must NOT scroll: the
      // inner ChatMessageList owns scrolling so useAutoScroll can track it.
      "flex flex-col flex-grow min-h-0 overflow-hidden",
      className,
    )}
    {...props}
  />
);

ExpandableChatBody.displayName = "ExpandableChatBody";

const ExpandableChatFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => <div className={cn("border-t p-3", className)} {...props} />;

ExpandableChatFooter.displayName = "ExpandableChatFooter";

interface ExpandableChatToggleProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  isOpen: boolean;
  toggleChat: () => void;
}

const ExpandableChatToggle: React.FC<ExpandableChatToggleProps> = ({
  className,
  icon,
  isOpen,
  toggleChat,
  ...props
}) => (
  <Button
    variant="default"
    onClick={toggleChat}
    aria-label={isOpen ? "Close chat" : "Open chat"}
    className={cn(
      "w-12 h-12 rounded-full shadow-lg flex items-center justify-center hover:shadow-xl transition-all duration-300 ring-offset-background",
      className,
    )}
    {...props}
  >
    {isOpen ? (
      <X className="h-6 w-6" />
    ) : (
      icon || <MessageCircle className="h-6 w-6" />
    )}
  </Button>
);

ExpandableChatToggle.displayName = "ExpandableChatToggle";


interface ChatBubbleProps {
  variant?: "sent" | "received"
  layout?: "default" | "ai"
  className?: string
  children: React.ReactNode
}

export function ChatBubble({
  variant = "received",
  layout = "default",
  className,
  children,
}: ChatBubbleProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-1.5 mb-1",
        variant === "sent" && "flex-row-reverse",
        className,
      )}
    >
      {children}
    </div>
  )
}

interface ChatBubbleMessageProps {
  variant?: "sent" | "received"
  isLoading?: boolean
  className?: string
  children?: React.ReactNode
}

export function ChatBubbleMessage({
  variant = "received",
  isLoading,
  className,
  children,
}: ChatBubbleMessageProps) {
  return (
    <div
      className={cn(
        "rounded-lg p-3",
        variant === "sent" ? "bg-primary text-primary-foreground" : "bg-muted",
        className
      )}
    >
      {isLoading ? (
        <div className="flex items-center space-x-2">
          <MessageLoading />
        </div>
      ) : (
        children
      )}
    </div>
  )
}

interface ChatBubbleAvatarProps {
  src?: string
  fallback?: string
  className?: string
}

export function ChatBubbleAvatar({
  src,
  fallback = "AI",
  className,
}: ChatBubbleAvatarProps) {
  return (
    <Avatar className={cn("h-8 w-8", className)}>
      {src && <AvatarImage src={src} />}
      <AvatarFallback>{fallback}</AvatarFallback>
    </Avatar>
  )
}

interface ChatBubbleActionProps {
  icon?: React.ReactNode
  onClick?: () => void
  className?: string
}

export function ChatBubbleAction({
  icon,
  onClick,
  className,
}: ChatBubbleActionProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("h-6 w-6", className)}
      onClick={onClick}
    >
      {icon}
    </Button>
  )
}

export function ChatBubbleActionWrapper({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("flex items-center gap-1 mt-2", className)}>
      {children}
    </div>
  )
}

function MessageLoading() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      className="text-foreground"
    >
      <circle cx="4" cy="12" r="2" fill="currentColor">
        <animate
          id="spinner_qFRN"
          begin="0;spinner_OcgL.end+0.25s"
          attributeName="cy"
          calcMode="spline"
          dur="0.6s"
          values="12;6;12"
          keySplines=".33,.66,.66,1;.33,0,.66,.33"
        />
      </circle>
      <circle cx="12" cy="12" r="2" fill="currentColor">
        <animate
          begin="spinner_qFRN.begin+0.1s"
          attributeName="cy"
          calcMode="spline"
          dur="0.6s"
          values="12;6;12"
          keySplines=".33,.66,.66,1;.33,0,.66,.33"
        />
      </circle>
      <circle cx="20" cy="12" r="2" fill="currentColor">
        <animate
          id="spinner_OcgL"
          begin="spinner_qFRN.begin+0.2s"
          attributeName="cy"
          calcMode="spline"
          dur="0.6s"
          values="12;6;12"
          keySplines=".33,.66,.66,1;.33,0,.66,.33"
        />
      </circle>
    </svg>
  );
}

interface ChatMessageListProps extends React.HTMLAttributes<HTMLDivElement> {
  smooth?: boolean;
}

const ChatMessageList = React.forwardRef<HTMLDivElement, ChatMessageListProps>(
  ({ className, children, smooth = false, ...props }, ref) => {
    const {
      scrollRef,
      isAtBottom,
      autoScrollEnabled,
      scrollToBottom,
      disableAutoScroll,
    } = useAutoScroll({
      smooth,
      content: children,
    });

    // Merge the refs
    React.useImperativeHandle(ref, () => scrollRef.current as HTMLDivElement);

    return (
      <div className="relative flex-1 min-h-0 w-full flex flex-col">
        <div
          className={`flex-1 min-h-0 flex flex-col w-full p-2 overflow-y-auto ${className ?? ""}`}
          ref={scrollRef}
          onWheel={disableAutoScroll}
          onTouchMove={disableAutoScroll}
          {...props}
        >
          <div className="flex flex-col gap-1">{children}</div>
        </div>

        {!isAtBottom && (
          <Button
            onClick={() => {
              scrollToBottom();
            }}
            size="icon"
            variant="outline"
            className="absolute bottom-2 left-1/2 transform -translate-x-1/2 inline-flex rounded-full shadow-md"
            aria-label="Scroll to bottom"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  }
);

ChatMessageList.displayName = "ChatMessageList";


interface ChatInputProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> { }

const ChatInput = React.forwardRef<HTMLTextAreaElement, ChatInputProps>(
  ({ className, ...props }, ref) => (
    <Textarea
      autoComplete="off"
      ref={ref}
      name="message"
      placeholder="Type your message..."
      className={cn(
        "max-h-12 px-4 py-3 bg-background text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 w-full rounded-md flex items-center h-16 resize-none",
        className,
      )}
      {...props}
    />
  ),
);
ChatInput.displayName = "ChatInput";

export {
  ExpandableChat,
  ExpandableChatHeader,
  ExpandableChatBody,
  ExpandableChatFooter,
  ChatMessageList,
  ChatInput,
  useChatContext,
};
