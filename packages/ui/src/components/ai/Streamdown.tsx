import React from "react";
import type { StreamdownProps } from "streamdown";

import { cn } from "../../lib/utils";

const LazyStreamdown = React.lazy(async () => {
  const module = await import("streamdown");
  return { default: module.Streamdown };
});

class StreamdownErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

export type { StreamdownProps };

export const Streamdown = React.memo((props: StreamdownProps) => {
  const { children, className } = props;
  const fallback = (
    <div className={cn("whitespace-pre-wrap", className)}>{children}</div>
  );

  return (
    <StreamdownErrorBoundary fallback={fallback}>
      <React.Suspense fallback={fallback}>
        <LazyStreamdown {...props} />
      </React.Suspense>
    </StreamdownErrorBoundary>
  );
});

Streamdown.displayName = "Streamdown";
