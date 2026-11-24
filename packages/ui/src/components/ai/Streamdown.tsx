import React from "react";
import type { StreamdownProps } from "streamdown";

import { cn } from "../../lib/utils";
import { normalizeMathDelimiters } from "./markdown-math";

type RendererComponent = React.ComponentType<StreamdownProps>;

/**
 * Module-level cache for the (large) markdown renderer.
 *
 * Deliberately NOT `React.lazy`: React caches a rejected lazy payload as
 * rejected for the lifetime of the component, so ONE transient chunk failure —
 * the dev server restarting, a dropped request, a rebuild that changed the
 * chunk hash — turned every message in the transcript into raw markdown until
 * the whole window was reloaded. Clearing the in-flight promise on failure lets
 * the next mount try again.
 */
let cachedRenderer: RendererComponent | null = null;
let inFlightRenderer: Promise<RendererComponent> | null = null;

const loadRenderer = (): Promise<RendererComponent> => {
  if (cachedRenderer) return Promise.resolve(cachedRenderer);
  if (inFlightRenderer) return inFlightRenderer;

  inFlightRenderer = (async () => {
    const streamdown = await import("streamdown");

    // Math is an enhancement, not a prerequisite: a broken or blocked math
    // chunk (missing KaTeX CSS, a sanitizer/plugin name mismatch after a
    // streamdown upgrade) must not take markdown down with it. Without this
    // guard the whole renderer fell back to plain text.
    let plugins: Pick<StreamdownProps, "remarkPlugins" | "rehypePlugins"> = {};
    try {
      const math = await import("./markdown-math-plugins");
      plugins = math.createMathMarkdownPlugins({
        remarkPlugins: streamdown.defaultRemarkPlugins,
        rehypePlugins: streamdown.defaultRehypePlugins,
      });
    } catch (error) {
      console.error("[Streamdown] math plugins unavailable; rendering without math", error);
    }

    const Base = streamdown.Streamdown;
    const Renderer: RendererComponent = (props) => <Base {...props} {...plugins} />;
    cachedRenderer = Renderer;
    return Renderer;
  })().catch((error) => {
    inFlightRenderer = null;
    throw error;
  });

  return inFlightRenderer;
};

class StreamdownErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    // Falling back to plain text is by design, but silently doing so made a
    // broken renderer indistinguishable from a message that is just markdown.
    console.error("[Streamdown] markdown render failed; showing plain text", error, info);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

export type { StreamdownProps };

export const Streamdown = React.memo((props: StreamdownProps) => {
  const { children, className } = props;
  // Agents spell inline math `\(…\)` (Claude) or `$…$` (DeepSeek); normalize
  // the LaTeX pair before streamdown splits the markdown into blocks.
  const content = React.useMemo(
    () => (typeof children === "string" ? normalizeMathDelimiters(children) : children),
    [children],
  );
  const [Renderer, setRenderer] = React.useState<RendererComponent | null>(
    () => cachedRenderer,
  );

  React.useEffect(() => {
    if (Renderer) return;
    let alive = true;
    loadRenderer()
      .then((loaded) => {
        if (alive) setRenderer(() => loaded);
      })
      .catch((error) => {
        console.error("[Streamdown] renderer unavailable; showing plain text", error);
      });
    return () => {
      alive = false;
    };
  }, [Renderer]);

  const fallback = (
    <div className={cn("whitespace-pre-wrap", className)}>{content}</div>
  );

  if (!Renderer) return fallback;

  return (
    <StreamdownErrorBoundary fallback={fallback}>
      <Renderer {...props} children={content} />
    </StreamdownErrorBoundary>
  );
});

Streamdown.displayName = "Streamdown";