import { useResolvedTheme } from "@kn/ui";
import React from "react";
import type {
  ShapeDefinition,
  ShapePreviewElement,
  ShapeThemeStyle,
} from "./shape-registry";

function paint(
  value: "fill" | "none" | "accent" | "stroke" | "text" | undefined,
  style: ShapeThemeStyle,
  fallback: keyof ShapeThemeStyle,
): string {
  if (value === "none") return "none";
  if (value === "fill") return style.fill;
  if (value === "accent") return style.accent;
  if (value === "stroke") return style.stroke;
  if (value === "text") return style.text;
  return style[fallback];
}

function PreviewElement({
  element,
  style,
  index,
}: {
  element: ShapePreviewElement;
  style: ShapeThemeStyle;
  index: number;
}) {
  const common = {
    key: index,
    fill: paint("fill" in element ? element.fill : undefined, style, "fill"),
    stroke: paint(
      "stroke" in element ? element.stroke : undefined,
      style,
      "stroke",
    ),
    strokeWidth: "strokeWidth" in element ? (element.strokeWidth ?? 1.8) : 1.8,
    strokeDasharray:
      "strokeDasharray" in element ? element.strokeDasharray : undefined,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
    vectorEffect: "non-scaling-stroke" as const,
  };
  switch (element.kind) {
    case "rect":
      return (
        <rect
          {...common}
          x={element.x}
          y={element.y}
          width={element.width}
          height={element.height}
          rx={element.rx}
        />
      );
    case "circle":
      return (
        <circle {...common} cx={element.cx} cy={element.cy} r={element.r} />
      );
    case "ellipse":
      return (
        <ellipse
          {...common}
          cx={element.cx}
          cy={element.cy}
          rx={element.rx}
          ry={element.ry}
        />
      );
    case "line":
      return (
        <line
          {...common}
          fill="none"
          x1={element.x1}
          y1={element.y1}
          x2={element.x2}
          y2={element.y2}
        />
      );
    case "path":
      return <path {...common} d={element.d} />;
    case "text":
      return (
        <text
          key={index}
          x={element.x}
          y={element.y}
          fill={paint(element.fill, style, "text")}
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize={element.size ?? 8}
          fontWeight={element.weight ?? 500}
          textAnchor={element.anchor ?? "start"}
          dominantBaseline="middle"
        >
          {element.text}
        </text>
      );
  }
}

export function ShapePreviewSvg({
  shape,
  className,
  title,
}: {
  shape: ShapeDefinition;
  className?: string;
  title?: string;
}) {
  const theme = useResolvedTheme();
  const style =
    theme === "dark" ? shape.defaultStyle.dark : shape.defaultStyle.light;
  return (
    <svg
      className={className}
      viewBox={shape.preview.viewBox}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      preserveAspectRatio="xMidYMid meet"
    >
      {shape.preview.elements.map((element, index) => (
        <PreviewElement
          key={`${shape.type}-${index}`}
          element={element}
          style={style}
          index={index}
        />
      ))}
    </svg>
  );
}
