import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NodeViewWrapper, NodeViewProps } from "@kn/editor";

import { Resizable } from "@kn/editor";
import { useFileService } from "@kn/common";
import { useI18n } from "../../i18n/use-i18n";

/** 初始展示时的最大宽度回退值(容器宽度不可测时使用) */
const FALLBACK_MAX_WIDTH = 640;

export const ImageView: React.FC<NodeViewProps> = ({
  editor,
  node,
  updateAttributes,
  getPos,
  selected
}) => {
  const { src, width, height, align, aspectRatio, float, alt, title, caption } = node.attrs;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const fileService = useFileService();
  const { t } = useI18n();

  const flexJustifyContent = useMemo(() => {
    if (align === "center") return "center";
    if (align === "right") return "flex-end";
    return "flex-start";
  }, [align]);

  // 优先使用已保存的宽高比;否则用图片自然尺寸推导;都没有时不锁定。
  const ratio = useMemo<number | undefined>(() => {
    if (typeof aspectRatio === "number" && aspectRatio > 0) return aspectRatio;
    if (natural && natural.h > 0) return natural.w / natural.h;
    if (typeof width === "number" && typeof height === "number" && height > 0) {
      return width / height;
    }
    return undefined;
  }, [aspectRatio, natural, width, height]);

  // 展示宽度:已保存则用之;否则按自然宽度并受容器宽度约束。
  const displayWidth = useMemo<number>(() => {
    if (typeof width === "number" && width > 0) return width;
    const containerW = wrapperRef.current?.clientWidth || 0;
    const naturalW = natural?.w || FALLBACK_MAX_WIDTH;
    const cap = containerW > 0 ? Math.min(naturalW, containerW) : Math.min(naturalW, FALLBACK_MAX_WIDTH);
    return Math.round(cap);
  }, [width, natural]);

  // 展示高度:已保存则用之;否则按比例推导,避免出现 auto/NaN。
  const displayHeight = useMemo<number>(() => {
    if (typeof height === "number" && height > 0) return height;
    return ratio ? Math.round(displayWidth / ratio) : displayWidth;
  }, [height, displayWidth, ratio]);

  const onResize = useCallback(
    (size: { width: number; height: number }) => {
      const w = Math.round(size.width);
      // 高度始终按比例换算,规避非像素值导致的 NaN 历史问题。
      const h = ratio ? Math.round(w / ratio) : Math.round(size.height);
      updateAttributes({ width: w, height: h, aspectRatio: ratio ?? null });
    },
    [updateAttributes, ratio]
  );

  const getSrc = useCallback((src: string) => {
    if (!src) return "";
    if (src.startsWith("http") || src.startsWith("https")) {
      return src;
    }
    if (src.startsWith("data:")) {
      return src;
    }
    return fileService.getDownloadUrl(src);
  }, [fileService]);

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) {
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    }
    setLoading(false);
    setError(false);
  }, []);

  const handleImageError = useCallback(() => {
    setLoading(false);
    setError(true);
  }, []);

  const imageSrc = useMemo(() => getSrc(src), [src, getSrc]);

  const captionRef = useRef<HTMLTextAreaElement>(null);
  const prevCaptionRef = useRef<string | null>(caption);

  // null = 未启用注脚;已启用后可编辑状态始终展示,只读状态仅在有内容时展示
  const showCaption = caption != null && (editor.isEditable || caption.trim().length > 0);

  // 通过气泡菜单启用注脚后自动聚焦;协作方的远程变更不抢占本地焦点
  useEffect(() => {
    if (prevCaptionRef.current == null && caption != null && editor.isFocused) {
      const el = captionRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }
    prevCaptionRef.current = caption;
  }, [caption, editor]);

  // 注脚随内容自动增高(无滚动条)
  useEffect(() => {
    const el = captionRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [caption, showCaption]);

  const handleCaptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateAttributes({ caption: e.target.value });
    },
    [updateAttributes]
  );

  // 失焦时若内容为空则移除注脚,保持文档干净
  const handleCaptionBlur = useCallback(
    (e: React.FocusEvent<HTMLTextAreaElement>) => {
      if (!e.currentTarget.value.trim()) {
        updateAttributes({ caption: null });
      }
    },
    [updateAttributes]
  );

  const handleCaptionKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        e.currentTarget.blur();
        const pos = getPos();
        if (typeof pos !== "number") return;
        const after = pos + node.nodeSize;
        const $after = editor.state.doc.resolve(Math.min(after, editor.state.doc.content.size));
        if ($after.nodeAfter?.isTextblock) {
          // 光标移到图片后的段落中,继续写作
          editor.chain().focus(after).run();
        } else {
          // 图片后没有文本块(如位于文末)时,补一个空段落
          editor.chain().insertContentAt(after, { type: "paragraph" }).focus(after + 1).run();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.currentTarget.blur();
      }
    },
    [editor, getPos, node.nodeSize]
  );

  // 阻止 ProseMirror 接管注脚输入框的交互事件(选中、拖拽、快捷键、粘贴)
  const stopCaptionEvent = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
  }, []);

  const captionTextAlign = useMemo<React.CSSProperties["textAlign"]>(() => {
    if (align === "center") return "center";
    if (align === "right") return "right";
    return "left";
  }, [align]);

  return (
    <NodeViewWrapper
      ref={wrapperRef as any}
      draggable
      style={{
        float: float || "none",
        maxWidth: "100%",
        margin: "5px",
        position: "relative",
        display: "flex",
        justifyContent: flexJustifyContent
      } as React.CSSProperties}>
      <div className="flex max-w-full flex-col">
        <Resizable
          width={displayWidth}
          height={displayHeight}
          editor={editor}
          getPos={getPos}
          selected={selected}
          className="max-w-full"
          minWidth={48}
          aspectRatio={ratio}
          onResizeStop={onResize}>
          <div style={{ position: "relative", width: "100%", height: "100%" }}>
          {loading && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "4px",
                zIndex: 1
              }}>
              <span style={{ color: "#888" }}>{t('image.loading')}</span>
            </div>
          )}
          {error ? (
            <div
              style={{
                width: "100%",
                height: displayHeight,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#f5f5f5",
                border: "1px dashed #ccc",
                borderRadius: "4px",
                color: "#888",
                padding: "20px",
                textAlign: "center"
              }}>
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ marginBottom: "8px" }}>
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span>{t('image.failedToLoad')}</span>
              {src && <small style={{ marginTop: "4px", wordBreak: "break-all" }}>{src}</small>}
            </div>
          ) : (
            <img
              src={imageSrc}
              alt={alt || t('image.alt')}
              title={title}
              loading="lazy"
              onLoad={handleImageLoad}
              onError={handleImageError}
              style={{
                display: "block",
                width: "100%",
                height: "auto",
                opacity: loading ? 0 : 1,
                transition: "opacity 0.3s ease-in-out",
                objectFit: "contain",
                borderRadius: "4px"
              }}
            />
          )}
          </div>
        </Resizable>
        {showCaption &&
          (editor.isEditable ? (
            <textarea
              ref={captionRef}
              rows={1}
              value={caption ?? ""}
              placeholder={t('image.captionPlaceholder')}
              onChange={handleCaptionChange}
              onBlur={handleCaptionBlur}
              onKeyDown={handleCaptionKeyDown}
              onMouseDown={stopCaptionEvent}
              onPointerDown={stopCaptionEvent}
              onClick={stopCaptionEvent}
              onPaste={stopCaptionEvent}
              onDragStart={stopCaptionEvent}
              className="w-full resize-none overflow-hidden bg-transparent px-0.5 pt-1 text-xs leading-normal text-muted-foreground outline-none placeholder:text-muted-foreground/50"
              style={{ textAlign: captionTextAlign }}
            />
          ) : (
            <div
              className="whitespace-pre-wrap px-0.5 pt-1 text-xs leading-normal text-muted-foreground"
              style={{ textAlign: captionTextAlign }}>
              {caption}
            </div>
          ))}
      </div>
    </NodeViewWrapper>
  );
};
