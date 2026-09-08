import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@kn/ui";
import React, { useEffect, useState } from "react";

export interface DiagramExportOptions {
  type: "json" | "png" | "svg" | "pdf";
  filename: string;
  transparent: boolean;
  padding: number;
  scale: number;
  selectionOnly: boolean;
}

export function ExportDialog({
  open,
  initialType,
  defaultName,
  busy,
  progress,
  onOpenChange,
  onExport,
  onCancel,
}: {
  open: boolean;
  initialType: DiagramExportOptions["type"];
  defaultName: string;
  busy: boolean;
  progress?: string;
  onOpenChange: (open: boolean) => void;
  onExport: (options: DiagramExportOptions) => void;
  onCancel: () => void;
}) {
  const [options, setOptions] = useState<DiagramExportOptions>({
    type: initialType,
    filename: defaultName,
    transparent: false,
    padding: 32,
    scale: 2,
    selectionOnly: false,
  });
  useEffect(() => {
    if (open)
      setOptions((current) => ({
        ...current,
        type: initialType,
        filename: defaultName,
      }));
  }, [defaultName, initialType, open]);
  const image = options.type === "png" || options.type === "svg";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>导出流程图</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>格式</Label>
            <Select
              value={options.type}
              onValueChange={(type) =>
                setOptions({
                  ...options,
                  type: type as DiagramExportOptions["type"],
                })
              }
            >
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="json">JSON</SelectItem>
                <SelectItem value="png">PNG</SelectItem>
                <SelectItem value="svg">SVG</SelectItem>
                <SelectItem value="pdf">PDF（全部页面）</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>文件名</Label>
            <Input
              className="h-11"
              value={options.filename}
              onChange={(event) =>
                setOptions({ ...options, filename: event.target.value })
              }
            />
          </div>
          {image && (
            <>
              <div className="flex min-h-11 items-center justify-between">
                <Label>仅导出当前选择</Label>
                <Switch
                  checked={options.selectionOnly}
                  onCheckedChange={(selectionOnly) =>
                    setOptions({ ...options, selectionOnly })
                  }
                />
              </div>
              <div className="flex min-h-11 items-center justify-between">
                <Label>透明背景</Label>
                <Switch
                  checked={options.transparent}
                  onCheckedChange={(transparent) =>
                    setOptions({ ...options, transparent })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-2 text-sm">
                  <span>边距</span>
                  <Input
                    type="number"
                    min={0}
                    max={200}
                    className="h-11"
                    value={options.padding}
                    onChange={(event) =>
                      setOptions({
                        ...options,
                        padding: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span>倍率</span>
                  <Input
                    type="number"
                    min={1}
                    max={4}
                    className="h-11"
                    value={options.scale}
                    onChange={(event) =>
                      setOptions({
                        ...options,
                        scale: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
            </>
          )}
          {progress && (
            <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              {progress}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            className="h-11"
            onClick={busy ? onCancel : () => onOpenChange(false)}
          >
            {busy ? "取消导出" : "取消"}
          </Button>
          <Button
            className="h-11"
            disabled={busy || !options.filename.trim()}
            onClick={() => onExport(options)}
          >
            {busy ? "导出中…" : "导出"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
