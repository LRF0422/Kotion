/**
 * AI Elements — Tool
 *
 * Adapted from shadcn/ui AI Elements. Tool-state names mirror AI SDK v6, but
 * tool payloads are plain values (the host chat is not built on `ToolUIPart`),
 * so the components stay usable with the agent's own step records.
 */

import React, {
  isValidElement,
  type ComponentProps,
  type ReactNode,
} from "react";

import {
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock,
  Wrench,
  XCircle,
} from "@kn/icon";

import { Badge } from "../ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import { CodeBlock } from "./code-block";
import { cn } from "../../lib/utils";

export type ToolState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-error"
  | "output-denied";

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
  <Collapsible
    className={cn(
      "not-prose mb-2 w-full overflow-hidden rounded-lg transition-colors",
      "hover:bg-muted/30 data-[state=open]:bg-muted/20",
      className,
    )}
    {...props}
  />
);

export type ToolHeaderProps = {
  title?: string;
  type?: string;
  state: ToolState;
  className?: string;
  labels?: Partial<Record<ToolState, string>>;
  /** Semantic icon for this tool; defaults to a wrench. */
  icon?: React.ComponentType<{ className?: string }>;
};

const DEFAULT_LABELS: Record<ToolState, string> = {
  "input-streaming": "Pending",
  "input-available": "Running",
  "approval-requested": "Awaiting Approval",
  "approval-responded": "Responded",
  "output-available": "Completed",
  "output-error": "Error",
  "output-denied": "Denied",
};

const getStatusIcon = (state: ToolState): ReactNode => {
  switch (state) {
    case "input-streaming":
      return <Circle className="size-3.5" />;
    case "input-available":
      return <Clock className="size-3.5 animate-pulse" />;
    case "approval-requested":
      return <Clock className="size-3.5 text-amber-600" />;
    case "approval-responded":
      return <CheckCircle2 className="size-3.5 text-blue-600" />;
    case "output-available":
      return <CheckCircle2 className="size-3.5 text-emerald-600" />;
    case "output-error":
      return <XCircle className="size-3.5 text-destructive" />;
    case "output-denied":
      return <XCircle className="size-3.5 text-orange-600" />;
  }
};

export const ToolHeader = ({
  className,
  title,
  type,
  state,
  labels,
  icon: Icon = Wrench,
  ...props
}: ToolHeaderProps) => (
  <CollapsibleTrigger
    className={cn(
      "group/tool flex min-h-9 w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left lg:min-h-7 lg:py-1",
      className,
    )}
    {...props}
  >
    <div className="flex min-w-0 items-center gap-2">
      <Icon className="size-3 shrink-0 text-muted-foreground" />
      <span className="truncate text-[11px] font-medium lg:text-xs">
        {title ?? type?.split("-").slice(1).join("-") ?? "Tool"}
      </span>
      <Badge
        className="shrink-0 gap-1 rounded-full border-0 bg-transparent px-0 py-0 text-[9px] font-normal hover:bg-transparent"
        variant="secondary"
      >
        {getStatusIcon(state)}
        {labels?.[state] ?? DEFAULT_LABELS[state]}
      </Badge>
    </div>
    <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/tool:rotate-180" />
  </CollapsibleTrigger>
);

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
  <CollapsibleContent
    className={cn(
      "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2 text-popover-foreground outline-none",
      className,
    )}
    {...props}
  />
);

export type ToolInputProps = ComponentProps<"div"> & {
  input: unknown;
  label?: string;
};

export const ToolInput = ({ className, input, label = "Parameters", ...props }: ToolInputProps) => {
  if (input === undefined || input === null) return null;

  return (
    <div className={cn("space-y-1 overflow-hidden px-2.5 pb-2.5", className)} {...props}>
      <h4 className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </h4>
      <CodeBlock
        code={typeof input === "string" ? input : JSON.stringify(input, null, 2)}
        language="json"
        className="border-0 bg-muted/40 [&>div>pre]:max-h-48 [&>div>pre]:p-2"
      />
    </div>
  );
};

export type ToolOutputProps = ComponentProps<"div"> & {
  output: unknown;
  errorText?: unknown;
  label?: string;
  errorLabel?: string;
};

export const ToolOutput = ({
  className,
  output,
  errorText,
  label = "Result",
  errorLabel = "Error",
  ...props
}: ToolOutputProps) => {
  if (!(output || errorText)) return null;

  let Output: ReactNode = <div>{output as ReactNode}</div>;

  if (typeof output === "object" && !isValidElement(output)) {
    Output = <CodeBlock className="border-0" code={JSON.stringify(output, null, 2)} language="json" />;
  } else if (typeof output === "string") {
    Output = <CodeBlock className="border-0" code={output} language="text" />;
  }

  return (
    <div className={cn("space-y-1 px-2.5 pb-2.5", className)} {...props}>
      <h4 className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {errorText ? errorLabel : label}
      </h4>
      <div
        className={cn(
          "overflow-x-auto rounded-md text-xs [&_table]:w-full",
          errorText ? "bg-destructive/10 text-destructive" : "bg-muted/40 text-foreground",
        )}
      >
        {errorText ? <div className="p-2">{String(errorText)}</div> : Output}
      </div>
    </div>
  );
};