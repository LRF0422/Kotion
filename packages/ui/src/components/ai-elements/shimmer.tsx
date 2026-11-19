/**
 * AI Elements — Shimmer
 *
 * The upstream component animates a background gradient with Motion. This
 * repository already ships the same visual language as the `text-shimmer`
 * keyframe (used by the agent's in-progress labels), so the adaptation reuses
 * it and degrades to plain muted text under `prefers-reduced-motion`.
 */

import React, { memo, type CSSProperties, type ElementType } from "react";

import { cn } from "../../lib/utils";

export type TextShimmerProps = {
  children: string;
  as?: ElementType;
  className?: string;
  duration?: number;
  spread?: number;
};

const ShimmerComponent = ({
  children,
  as: Component = "p",
  className,
  duration = 2,
  spread: _spread = 2,
}: TextShimmerProps) => (
  <Component
    className={cn(
      "relative inline-block bg-[length:200%_100%] bg-clip-text text-transparent",
      "animate-text-shimmer bg-gradient-to-r from-muted-foreground/40 via-foreground to-muted-foreground/40",
      "motion-reduce:animate-none motion-reduce:bg-none motion-reduce:text-muted-foreground",
      className,
    )}
    style={{ animationDuration: `${duration}s` } as CSSProperties}
  >
    {children}
  </Component>
);

export const Shimmer = memo(ShimmerComponent);