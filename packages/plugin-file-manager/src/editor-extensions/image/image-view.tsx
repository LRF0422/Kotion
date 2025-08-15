import React, { useCallback, useMemo } from "react";
import { NodeViewWrapper, NodeViewProps } from "@kn/editor";

import { Resizable } from "@kn/editor";
import { useUploadFile } from "@kn/core";

export const ImageView: React.FC<NodeViewProps> = ({
  editor,
  node: { attrs },
  updateAttributes,
  getPos
}) => {
  const { src, width, height, align, aspectRatio } = attrs;

  const { usePath } = useUploadFile()

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

  const getSrc = (src: string) => {
    if (src.startsWith("http") || src.startsWith("https")) {
      return src;
    }
    return usePath(src);
  }

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
        <img src={getSrc(src)} width={"100%"} />
      </Resizable>
    </NodeViewWrapper>
  );
};
