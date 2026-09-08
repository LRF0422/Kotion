import {
  AlertCircle,
  Cloud,
  CloudOff,
  Loader2,
  RefreshCw,
  Users,
} from "@kn/icon";
import { Button } from "@kn/ui";
import React from "react";

export type SyncStatus =
  | "local"
  | "connecting"
  | "synced"
  | "pending"
  | "offline";

const LABELS: Record<SyncStatus, string> = {
  local: "已保存到文档",
  connecting: "正在连接",
  synced: "已同步",
  pending: "正在保存",
  offline: "离线",
};

export function StatusBar({
  status,
  collaborators,
  zoom,
  pageName,
  lastSavedAt,
  error,
  onRetry,
}: {
  status: SyncStatus;
  collaborators: number;
  zoom: string;
  pageName?: string;
  lastSavedAt?: number | null;
  error?: string | null;
  onRetry?: () => void;
}) {
  const Icon = error
    ? AlertCircle
    : status === "offline"
      ? CloudOff
      : status === "pending" || status === "connecting"
        ? Loader2
        : Cloud;
  return (
    <div className="logicflow-statusbar">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`flex items-center gap-1.5 ${error ? "text-destructive" : ""}`}
        >
          <Icon
            className={`h-3.5 w-3.5 ${!error && (status === "pending" || status === "connecting") ? "animate-spin" : ""}`}
          />
          <span className="truncate">{error || LABELS[status]}</span>
        </span>
        {error && onRetry && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 gap-1 px-2 text-[11px]"
            onClick={onRetry}
          >
            <RefreshCw className="h-3 w-3" />
            重试
          </Button>
        )}
        {lastSavedAt && !error && (
          <span className="hidden text-[10px] text-muted-foreground md:inline">
            {new Date(lastSavedAt).toLocaleTimeString()}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {pageName && <span className="max-w-40 truncate">{pageName}</span>}
        <span className="flex items-center gap-1">
          <Users className="h-3.5 w-3.5" />
          {collaborators}
        </span>
        <span>{zoom}</span>
      </div>
    </div>
  );
}
