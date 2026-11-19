/**
 * AI Elements — Suggestion
 *
 * Adapted from shadcn/ui AI Elements. The scrollable strip uses a plain
 * overflow container so it behaves identically inside the dock and the
 * full-width kernel page.
 */

import React, { type ComponentProps, type HTMLAttributes } from "react";

import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

export type SuggestionsProps = HTMLAttributes<HTMLDivElement>;

export const Suggestions = ({ className, children, ...props }: SuggestionsProps) => (
  <div className={cn("w-full overflow-x-auto whitespace-nowrap", className)} {...props}>
    <div className="flex w-max flex-nowrap items-center gap-2">{children}</div>
  </div>
);

export type SuggestionProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  suggestion: string;
  onClick?: (suggestion: string) => void;
};

export const Suggestion = ({
  suggestion,
  onClick,
  className,
  variant = "outline",
  size = "sm",
  children,
  ...props
}: SuggestionProps) => {
  const handleClick = () => {
    onClick?.(suggestion);
  };

  return (
    <Button
      className={cn("cursor-pointer rounded-full px-4", className)}
      onClick={handleClick}
      size={size}
      type="button"
      variant={variant}
      {...props}
    >
      {children || suggestion}
    </Button>
  );
};