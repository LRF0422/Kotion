import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  FlipHorizontal2,
  FlipVertical2,
  Group,
  Italic,
  Lock,
  RotateCcw,
  RotateCw,
  Ungroup,
  Unlock,
} from "@kn/icon";
import {
  Button,
  ColorPicker,
  Input,
  Label,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@kn/ui";
import React from "react";
import type { DiagramCommandService } from "../commands";
import { createSelectionState, isElementLocked } from "../commands";
import { moveElementsToLayer } from "../model/layers";
import { RichTextEditor } from "../rich-text";
import { sanitizeRichCardContent } from "../rich-text/rich-card-content";
import type {
  JsonValue,
  LogicFlowEdgeData,
  LogicFlowNodeData,
  Page,
} from "../model/types";

function textValue(element: LogicFlowNodeData | LogicFlowEdgeData): string {
  return typeof element.text === "string"
    ? element.text
    : (element.text?.value ?? "");
}

export function InspectorPanel({
  page,
  selection,
  commands,
  onUpdatePage,
}: {
  page: Page;
  selection: string[];
  commands: DiagramCommandService;
  onUpdatePage: (page: Page) => void;
}) {
  const state = createSelectionState(page, selection);
  const primary = state.elements[0];
  const primaryNode = page.graph.nodes.find((node) => node.id === primary?.id);
  const primaryEdge = page.graph.edges.find((edge) => edge.id === primary?.id);
  const properties = primary?.properties ?? {};
  const fill =
    typeof properties.fill === "string" ? properties.fill : "#ffffff";
  const stroke =
    typeof properties.stroke === "string" ? properties.stroke : "#64748b";
  const textColor =
    typeof properties.textColor === "string" ? properties.textColor : "#0f172a";
  const opacity =
    typeof properties.opacity === "number" ? properties.opacity : 100;

  const updateText = (value: string) => {
    if (!primary) return;
    const ids = new Set(state.editableIds);
    const update = <T extends LogicFlowNodeData | LogicFlowEdgeData>(
      element: T,
    ): T => {
      if (!ids.has(element.id)) return element;
      return {
        ...element,
        text:
          element.text && typeof element.text === "object"
            ? { ...element.text, value }
            : value,
      };
    };
    onUpdatePage({
      ...page,
      graph: {
        nodes: page.graph.nodes.map(update),
        edges: page.graph.edges.map(update),
      },
    });
  };

  const updateNodeNumber = (
    key: "x" | "y" | "width" | "height" | "rotate",
    value: number,
  ) => {
    const ids = new Set(state.nodeIds);
    onUpdatePage({
      ...page,
      graph: {
        ...page.graph,
        nodes: page.graph.nodes.map((node) =>
          ids.has(node.id) && !isElementLocked(page, node.id)
            ? ({ ...node, [key]: value } as LogicFlowNodeData)
            : node,
        ),
      },
    });
  };

  if (!primary) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
        选择节点或连线后编辑样式、文字和排列属性
      </div>
    );
  }

  return (
    <Tabs defaultValue="style" className="flex h-full min-h-0 flex-col">
      <TabsList className="h-11 w-full shrink-0 justify-start rounded-none border-b bg-transparent px-1">
        <TabsTrigger value="style" className="h-9 flex-1 text-xs">
          样式
        </TabsTrigger>
        <TabsTrigger value="text" className="h-9 flex-1 text-xs">
          文字
        </TabsTrigger>
        <TabsTrigger value="arrange" className="h-9 flex-1 text-xs">
          排列
        </TabsTrigger>
      </TabsList>
      <ScrollArea className="min-h-0 flex-1">
        <TabsContent value="style" className="m-0 space-y-5 p-4">
          <section className="space-y-3">
            <Label className="text-xs">填充</Label>
            <div className="flex items-center gap-2">
              <ColorPicker
                value={fill}
                trigger="button"
                triggerAriaLabel="填充颜色"
                onChange={(color) =>
                  commands.patchProperties({
                    fill: color,
                    style: {
                      ...(typeof properties.style === "object" &&
                      properties.style
                        ? properties.style
                        : {}),
                      fill: color,
                    } as JsonValue,
                  })
                }
                onUnset={() => commands.patchProperties({ fill: undefined })}
              />
              <span className="text-xs text-muted-foreground">{fill}</span>
            </div>
          </section>
          <section className="space-y-3">
            <Label className="text-xs">描边</Label>
            <ColorPicker
              value={stroke}
              trigger="button"
              triggerAriaLabel="描边颜色"
              onChange={(color) => commands.patchProperties({ stroke: color })}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                min={0}
                max={20}
                className="h-11"
                value={
                  typeof properties.strokeWidth === "number"
                    ? properties.strokeWidth
                    : 2
                }
                onChange={(event) =>
                  commands.patchProperties({
                    strokeWidth: Number(event.target.value),
                  })
                }
              />
              <Select
                value={
                  typeof properties.strokeDasharray === "string"
                    ? properties.strokeDasharray
                    : "solid"
                }
                onValueChange={(value) =>
                  commands.patchProperties({ strokeDasharray: value })
                }
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="solid">实线</SelectItem>
                  <SelectItem value="8 4">虚线</SelectItem>
                  <SelectItem value="2 4">点线</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </section>
          <section className="space-y-3">
            <div className="flex justify-between text-xs">
              <span>透明度</span>
              <span>{opacity}%</span>
            </div>
            <Slider
              value={[opacity]}
              min={0}
              max={100}
              step={1}
              onValueChange={([value]) =>
                commands.patchProperties({ opacity: value })
              }
            />
          </section>
          {primaryEdge && (
            <section className="space-y-3 border-t pt-4">
              <Label className="text-xs">连接线</Label>
              <Select
                value={primaryEdge.type}
                onValueChange={(value) => commands.changeEdgeType(value)}
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="line">直线</SelectItem>
                  <SelectItem value="polyline">折线</SelectItem>
                  <SelectItem value="bezier">曲线</SelectItem>
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={
                    typeof properties.startArrowType === "string"
                      ? properties.startArrowType
                      : "none"
                  }
                  onValueChange={(value) =>
                    commands.patchProperties({ startArrowType: value })
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="起点" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">无起点</SelectItem>
                    <SelectItem value="solid">箭头</SelectItem>
                    <SelectItem value="circle">圆点</SelectItem>
                    <SelectItem value="diamond">菱形</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={
                    typeof properties.endArrowType === "string"
                      ? properties.endArrowType
                      : "solid"
                  }
                  onValueChange={(value) =>
                    commands.patchProperties({ endArrowType: value })
                  }
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="终点" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">无终点</SelectItem>
                    <SelectItem value="solid">箭头</SelectItem>
                    <SelectItem value="circle">圆点</SelectItem>
                    <SelectItem value="diamond">菱形</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="h-11 w-full"
                variant="outline"
                onClick={commands.reverseEdges}
              >
                反转方向
              </Button>
            </section>
          )}
        </TabsContent>
        <TabsContent value="text" className="m-0 space-y-4 p-4">
          <Label className="text-xs">内容</Label>
          <textarea
            value={textValue(primary)}
            className="min-h-24 w-full rounded-md border bg-background p-3 text-sm outline-none focus:ring-1 focus:ring-ring"
            onChange={(event) => updateText(event.target.value)}
          />
          <div className="flex gap-1">
            <Button
              type="button"
              variant={properties.bold === true ? "secondary" : "outline"}
              size="icon"
              className="h-11 w-11"
              onClick={() =>
                commands.patchProperties({ bold: properties.bold !== true })
              }
            >
              <Bold className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant={properties.italic === true ? "secondary" : "outline"}
              size="icon"
              className="h-11 w-11"
              onClick={() =>
                commands.patchProperties({ italic: properties.italic !== true })
              }
            >
              <Italic className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-11 w-11"
              onClick={() => commands.patchProperties({ textAlign: "left" })}
            >
              <AlignLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-11 w-11"
              onClick={() => commands.patchProperties({ textAlign: "center" })}
            >
              <AlignCenter className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-11 w-11"
              onClick={() => commands.patchProperties({ textAlign: "right" })}
            >
              <AlignRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              className="h-11"
              value={
                typeof properties.fontSize === "number"
                  ? properties.fontSize
                  : 14
              }
              onChange={(event) =>
                commands.patchProperties({
                  fontSize: Number(event.target.value),
                })
              }
            />
            <ColorPicker
              value={textColor}
              trigger="button"
              triggerAriaLabel="文字颜色"
              onChange={(color) =>
                commands.patchProperties({ textColor: color })
              }
            />
          </div>
          {primaryNode?.type === "rich-card" && (
            <RichTextEditor
              content={sanitizeRichCardContent(properties.richContent)}
              disabled={state.editableIds.length === 0}
              onChange={(content) =>
                commands.patchProperties({
                  richContent: content as unknown as JsonValue,
                })
              }
            />
          )}
        </TabsContent>
        <TabsContent value="arrange" className="m-0 space-y-4 p-4">
          {primaryNode && (
            <div className="grid grid-cols-2 gap-2">
              {(["x", "y", "width", "height", "rotate"] as const).map((key) => (
                <label
                  key={key}
                  className="space-y-1 text-xs text-muted-foreground"
                >
                  <span>{key.toUpperCase()}</span>
                  <Input
                    type="number"
                    className="h-11"
                    value={
                      typeof primaryNode[key] === "number"
                        ? primaryNode[key]
                        : key === "width"
                          ? 100
                          : key === "height"
                            ? 60
                            : 0
                    }
                    onChange={(event) =>
                      updateNodeNumber(key, Number(event.target.value))
                    }
                  />
                </label>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button
              className="h-11"
              variant="outline"
              onClick={() => commands.rotate(-90)}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              -90°
            </Button>
            <Button
              className="h-11"
              variant="outline"
              onClick={() => commands.rotate(90)}
            >
              <RotateCw className="mr-2 h-4 w-4" />
              +90°
            </Button>
            <Button
              className="h-11"
              variant="outline"
              onClick={() => commands.flip("horizontal")}
            >
              <FlipHorizontal2 className="mr-2 h-4 w-4" />
              水平
            </Button>
            <Button
              className="h-11"
              variant="outline"
              onClick={() => commands.flip("vertical")}
            >
              <FlipVertical2 className="mr-2 h-4 w-4" />
              垂直
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button className="h-11" variant="outline" onClick={commands.group}>
              <Group className="mr-2 h-4 w-4" />
              分组
            </Button>
            <Button
              className="h-11"
              variant="outline"
              onClick={commands.ungroup}
            >
              <Ungroup className="mr-2 h-4 w-4" />
              取消
            </Button>
          </div>
          <Button
            className="h-11 w-full"
            variant="outline"
            onClick={() => commands.setLocked(!state.lockedIds.length)}
          >
            {state.lockedIds.length ? (
              <Unlock className="mr-2 h-4 w-4" />
            ) : (
              <Lock className="mr-2 h-4 w-4" />
            )}
            {state.lockedIds.length ? "解锁选择" : "锁定选择"}
          </Button>
          <Select
            onValueChange={(layerId) =>
              onUpdatePage(moveElementsToLayer(page, selection, layerId))
            }
          >
            <SelectTrigger className="h-11">
              <SelectValue placeholder="移动到图层" />
            </SelectTrigger>
            <SelectContent>
              {page.layers.map((layer) => (
                <SelectItem key={layer.id} value={layer.id}>
                  {layer.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TabsContent>
      </ScrollArea>
    </Tabs>
  );
}
