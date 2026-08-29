import { useTranslation } from "@kn/common";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  Loader2Icon,
  MoreVerticalIcon,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  PlusSquare,
  RefreshCwIcon,
  Settings,
  Trash2Icon,
  UploadIcon,
} from "@kn/icon";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Empty,
  Input,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@kn/ui";
import React, { useMemo } from "react";
import { PluginIcon } from "./PluginIcon";
import { PluginManager } from "./PluginManager";
import { PluginUploader } from "./PluginUploader";
import {
  getPluginInstallState,
  PluginRecord,
  PluginVersionRecord,
} from "./plugin-model";

interface InstalledExtensionsSidebarProps {
  plugins: PluginVersionRecord[];
  keyword: string;
  loading: boolean;
  error?: string;
  refreshing: boolean;
  currentPluginId?: string;
  loadedPluginNames: ReadonlySet<string>;
  pendingUpdateId?: string;
  pendingUninstallId?: string;
  collapsed?: boolean;
  showUtilityActions?: boolean;
  resolveIcon: (path?: string) => string;
  onKeywordChange: (value: string) => void;
  onRefresh: () => void;
  onRetry: () => void;
  onBrowse: () => void;
  onNavigate: (plugin: PluginVersionRecord) => void;
  onUpdate: (plugin: PluginVersionRecord) => void;
  onUninstall: (plugin: PluginVersionRecord) => void;
  onToggleCollapsed?: () => void;
}

const pluginKey = (plugin: PluginVersionRecord) =>
  String(plugin.id ?? plugin.subjectId ?? plugin.pluginKey ?? plugin.name);

export const InstalledExtensionsSidebar: React.FC<
  InstalledExtensionsSidebarProps
> = ({
  plugins,
  keyword,
  loading,
  error,
  refreshing,
  currentPluginId,
  loadedPluginNames,
  pendingUpdateId,
  pendingUninstallId,
  collapsed,
  showUtilityActions,
  resolveIcon,
  onKeywordChange,
  onRefresh,
  onRetry,
  onBrowse,
  onNavigate,
  onUpdate,
  onUninstall,
  onToggleCollapsed,
}) => {
  const { t } = useTranslation();
  const filteredPlugins = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    if (!query) return plugins;
    return plugins.filter((plugin) =>
      [plugin.name, plugin.description, plugin.developer]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [keyword, plugins]);

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={250}>
        <aside className="flex h-full min-h-0 flex-col items-center border-r border-border/70 bg-muted/20 py-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-11 shrink-0"
                onClick={onToggleCollapsed}
                aria-label={t("pluginHub.sidebar.expand")}
              >
                <PanelLeftOpen className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {t("pluginHub.sidebar.expand")}
            </TooltipContent>
          </Tooltip>

          <div className="my-2 h-px w-7 bg-border/70" />
          <div className="relative mb-2 flex size-10 items-center justify-center rounded-lg bg-background text-muted-foreground">
            <Package className="size-4" />
            <Badge className="absolute -right-1 -top-1 h-4 min-w-4 justify-center px-1 text-[9px] tabular-nums">
              {plugins.length}
            </Badge>
          </div>

          <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto px-1">
            {plugins.map((plugin) => {
              const selected = String(plugin.subjectId) === currentPluginId;
              return (
                <Tooltip key={pluginKey(plugin)}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "flex size-11 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selected ? "bg-accent" : "hover:bg-accent/70",
                      )}
                      onClick={() => onNavigate(plugin)}
                      aria-current={selected ? "page" : undefined}
                    >
                      <PluginIcon
                        src={resolveIcon(plugin.icon)}
                        name={plugin.name}
                        className="size-8 rounded-lg"
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{plugin.name}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </aside>
      </TooltipProvider>
    );
  }

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-border/70 bg-muted/20">
      <div className="shrink-0 border-b border-border/70 bg-background px-3 pb-3 pt-3">
        <div className="flex min-h-11 items-center gap-2">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Package className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold">
              {t("pluginHub.sidebar.title")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t("pluginHub.sidebar.count", { count: plugins.length })}
            </p>
          </div>
          <TooltipProvider delayDuration={250}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 lg:size-9"
                  onClick={onRefresh}
                  disabled={refreshing}
                  aria-label={t("pluginHub.sidebar.refresh")}
                >
                  <RefreshCwIcon
                    className={cn("size-4", refreshing && "animate-spin")}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("pluginHub.sidebar.refresh")}</TooltipContent>
            </Tooltip>
            {onToggleCollapsed && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11 lg:size-9"
                    onClick={onToggleCollapsed}
                    aria-label={t("pluginHub.sidebar.collapse")}
                  >
                    <PanelLeftClose className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {t("pluginHub.sidebar.collapse")}
                </TooltipContent>
              </Tooltip>
            )}
          </TooltipProvider>
        </div>

        {showUtilityActions && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <PluginUploader>
              <Button variant="outline" className="h-11 gap-2 text-xs">
                <PlusSquare className="size-4" />
                {t("pluginHub.publish")}
              </Button>
            </PluginUploader>
            <PluginManager>
              <Button variant="outline" className="h-11 gap-2 text-xs">
                <Settings className="size-4" />
                {t("pluginHub.manage")}
              </Button>
            </PluginManager>
          </div>
        )}

        <Input
          className="mt-3 h-11 bg-background text-sm lg:h-9"
          placeholder={t("pluginHub.sidebar.search")}
          value={keyword}
          onChange={(event) => onKeywordChange(event.target.value)}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        {loading ? (
          <div className="space-y-2" aria-label={t("pluginHub.sidebar.title")}>
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="flex items-center gap-3 rounded-xl border border-border/50 bg-background p-2.5"
              >
                <Skeleton className="size-10 shrink-0 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-3/5" />
                  <Skeleton className="h-2.5 w-4/5" />
                </div>
                <Skeleton className="size-8 rounded-md" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-4 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircleIcon className="size-5" />
            </div>
            <p className="text-sm font-medium">
              {t("pluginHub.sidebar.loadFailed")}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={onRetry}
            >
              {t("pluginHub.sidebar.retry")}
            </Button>
          </div>
        ) : filteredPlugins.length === 0 ? (
          keyword ? (
            <Empty
              title={t("pluginHub.sidebar.noResults", { query: keyword })}
              icon={<Package className="size-5" />}
            />
          ) : (
            <Empty
              title={t("pluginHub.sidebar.empty")}
              desc={t("pluginHub.sidebar.emptyDesc")}
              icon={<UploadIcon className="size-5" />}
              button={
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  onClick={onBrowse}
                >
                  {t("pluginHub.sidebar.browse")}
                </Button>
              }
            />
          )
        ) : (
          <div className="space-y-1.5">
            {filteredPlugins.map((plugin) => {
              const id = pluginKey(plugin);
              const selected = String(plugin.subjectId) === currentPluginId;
              const installState = getPluginInstallState(
                {
                  ...(plugin as PluginRecord),
                  installeddVersions: [plugin],
                },
                loadedPluginNames,
              );
              const updateAvailable = Boolean(
                plugin.activeVersionId &&
                String(plugin.activeVersionId) !== String(plugin.id),
              );
              const updating = pendingUpdateId === id;
              const uninstalling = pendingUninstallId === id;
              const pending = updating || uninstalling;
              const statusKey = installState.disabled
                ? "disabled"
                : installState.active
                  ? "active"
                  : "installed";

              return (
                <div
                  key={id}
                  className={cn(
                    "group flex items-center gap-2 rounded-xl border p-1.5 transition-colors",
                    selected
                      ? "border-primary/25 bg-primary/[0.05]"
                      : "border-transparent hover:border-border/70 hover:bg-background",
                  )}
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onNavigate(plugin)}
                    aria-current={selected ? "page" : undefined}
                  >
                    <PluginIcon
                      src={resolveIcon(plugin.icon)}
                      name={plugin.name}
                      className="size-10 rounded-lg"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {plugin.name}
                        </span>
                        {updateAvailable && (
                          <span
                            className="size-1.5 shrink-0 rounded-full bg-primary"
                            aria-label={t("pluginHub.sidebar.update")}
                          />
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {plugin.description}
                      </p>
                      <span
                        className={cn(
                          "mt-1 inline-flex items-center gap-1 text-[10px] font-medium",
                          statusKey === "active" &&
                            "text-green-600 dark:text-green-400",
                          statusKey === "disabled" &&
                            "text-orange-600 dark:text-orange-400",
                          statusKey === "installed" && "text-muted-foreground",
                        )}
                      >
                        <CheckCircleIcon className="size-3" />
                        {t(`pluginHub.sidebar.${statusKey}`)}
                      </span>
                    </div>
                  </button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-11 shrink-0 lg:size-9"
                        disabled={pending}
                        aria-label={t("pluginHub.sidebar.moreActions", {
                          name: plugin.name,
                        })}
                      >
                        {pending ? (
                          <Loader2Icon className="size-4 animate-spin" />
                        ) : (
                          <MoreVerticalIcon className="size-4" />
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-40">
                      {updateAvailable && (
                        <DropdownMenuItem onSelect={() => onUpdate(plugin)}>
                          <RefreshCwIcon className="mr-2 size-4" />
                          {updating
                            ? t("pluginHub.sidebar.updating")
                            : t("pluginHub.sidebar.update")}
                        </DropdownMenuItem>
                      )}
                      {updateAvailable && <DropdownMenuSeparator />}
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => onUninstall(plugin)}
                      >
                        <Trash2Icon className="mr-2 size-4" />
                        {t("pluginHub.sidebar.uninstall")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
};
