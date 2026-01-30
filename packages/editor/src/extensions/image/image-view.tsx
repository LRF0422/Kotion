import React, { useCallback, useMemo, useState } from "react";
import { NodeViewWrapper, NodeViewProps } from "@tiptap/react";

import { Resizable } from "../../components";

export const ImageView: React.FC<NodeViewProps> = ({
  editor,
  node: { attrs },
  updateAttributes,
  getPos
}) => {
  const { src, width, height, align, aspectRatio, alt, title } = attrs;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const flexJustifyContent = useMemo(() => {
    if (align === "center") return "center";
    if (align === "right") return "flex-end";
    return "flex-start";
  }, [align]);

  const onResize = useCallback(
    (size: any) => {
      updateAttributes({ width: size.width, height: size.height });
    },
    [updateAttributes]
  );

  const handleImageLoad = useCallback(() => {
    setLoading(false);
    setError(false);
  }, []);

  const handleImageError = useCallback(() => {
    setLoading(false);
    setError(true);
  }, []);

  return (
    <NodeViewWrapper
      draggable
      style={{
        position: "relative",
        display: "flex",
        justifyContent: flexJustifyContent
      }}>
      <Resizable
        width={width || 100}
        height={height || 100}
        editor={editor}
        getPos={getPos}
        aspectRatio={aspectRatio}
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
                backgroundColor: "#f0f0f0",
                borderRadius: "4px",
                zIndex: 1
              }}>
              <span style={{ color: "#888" }}>Loading...</span>
            </div>
          )}
          {error ? (
            <div
              style={{
                width: "100%",
                height: height || 100,
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
              <span>Failed to load image</span>
              {src && <small style={{ marginTop: "4px", wordBreak: "break-all" }}>{src}</small>}
            </div>
          ) : (
            <img
              src={src}
              alt={alt || "Image"}
              title={title}
              width="100%"
              loading="lazy"
              onLoad={handleImageLoad}
              onError={handleImageError}
              style={{
                opacity: loading ? 0 : 1,
                transition: "opacity 0.3s ease-in-out",
                objectFit: "contain",
                borderRadius: "4px"
              }}
            />
          )}
        </div>
      </Resizable>
    </NodeViewWrapper>
  );
};
