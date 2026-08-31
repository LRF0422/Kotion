import {
  AppContext,
  APIS,
  event,
  PLUGIN_CHANGED,
  Outlet,
  useApi,
  useLocation,
  useNavigator,
  usePluginState,
  useTranslation,
  useUploadFile,
} from "@kn/common";
import { AlertCircle, Loader2, Trash2 } from "@kn/icon";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Sheet,
  SheetContent,
  SheetTitle,
  cn,
  toast,
  useResponsive,
} from "@kn/ui";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { InstalledExtensionsSidebar } from "./InstalledExtensionsSidebar";
import { PluginHubTopBar } from "./PluginHubTopBar";
import { PluginVersionRecord } from "./plugin-model";

const SIDEBAR_STORAGE_KEY = "kn:plugin-sidebar-collapsed";
const pluginVersionKey = (plugin: PluginVersionRecord) =>
  String(plugin.id ?? plugin.subjectId ?? plugin.pluginKey ?? plugin.name);

export const Shop: React.FC = () => {
  const { isMobile, isTablet } = useResponsive();
  const { t } = useTranslation();
  const navigator = useNavigator();
  const location = useLocation();
  const { usePath } = useUploadFile();
  const { pluginManager } = useContext(AppContext);
  const { loadedPluginNames, incompatiblePlugins } = usePluginState();

  const [installedPlugins, setInstalledPlugins] = useState<
    PluginVersionRecord[]
  >([]);
  const [installedLoading, setInstalledLoading] = useState(true);
  const [installedError, setInstalledError] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pendingUpdateId, setPendingUpdateId] = useState<string>();
  const [pendingUninstallId, setPendingUninstallId] = useState<string>();
  const [pluginToUninstall, setPluginToUninstall] =
    useState<PluginVersionRecord>();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () =>
      typeof window !== "undefined" &&
      localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1",
  );
  const outletScrollRef = useRef<HTMLDivElement>(null);
  const suppressNextPluginEventRef = useRef(false);

  const currentPluginId = useMemo(() => {
    const match = /^\/plugin-hub\/([^/]+)/.exec(location.pathname);
    return match?.[1];
  }, [location.pathname]);

  const loadInstalled = useCallback(async (background = false) => {
    if (!background) setInstalledLoading(true);
    setInstalledError(undefined);
    try {
      const response = await useApi(APIS.GET_INSTALLED_PLUGINS);
      setInstalledPlugins(response.data ?? []);
    } catch (error) {
      setInstalledError(error instanceof Error ? error.message : "load-failed");
    } finally {
      if (!background) setInstalledLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInstalled();
  }, [loadInstalled]);

  useEffect(() => {
    const handlePluginChange = () => {
      if (suppressNextPluginEventRef.current) {
        suppressNextPluginEventRef.current = false;
        return;
      }
      void loadInstalled(true);
    };
    event.on(PLUGIN_CHANGED, handlePluginChange);
    return () => {
      event.off(PLUGIN_CHANGED, handlePluginChange);
    };
  }, [loadInstalled]);

  useEffect(() => {
    outletScrollRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Persistence is optional; the in-memory state still works.
      }
      return next;
    });
  }, []);

  const navigateToPlugin = useCallback(
    (plugin: PluginVersionRecord) => {
      if (!plugin.subjectId) return;
      navigator.go({ to: `/plugin-hub/${plugin.subjectId}` });
      setSidebarOpen(false);
    },
    [navigator],
  );

  const browseMarketplace = useCallback(() => {
    navigator.go({ to: "/plugin-hub" });
    setSidebarOpen(false);
  }, [navigator]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      pluginManager?.clearPluginCache();
      await loadInstalled(true);
      suppressNextPluginEventRef.current = true;
      event.emit(PLUGIN_CHANGED, { source: "refresh" });
    } finally {
      setRefreshing(false);
    }
  }, [loadInstalled, pluginManager]);

  const handleUpdate = useCallback(
    async (plugin: PluginVersionRecord) => {
      if (!plugin.id) return;
      const key = pluginVersionKey(plugin);
      setPendingUpdateId(key);
      try {
        await useApi(APIS.UPDATE_PLUGIN, { versionId: plugin.id });
        pluginManager?.clearPluginCache();
        await loadInstalled(true);
        suppressNextPluginEventRef.current = true;
        event.emit(PLUGIN_CHANGED, { source: "update" });
        toast.success(t("pluginHub.update.success"));
      } catch {
        toast.error(t("pluginHub.update.failed"));
      } finally {
        setPendingUpdateId(undefined);
      }
    },
    [loadInstalled, pluginManager, t],
  );

  const confirmUninstall = useCallback(async () => {
    if (!pluginToUninstall?.id) return;
    const key = pluginVersionKey(pluginToUninstall);
    setPendingUninstallId(key);
    try {
      await useApi(APIS.UNINSTALL_PLUGIN, { versionId: pluginToUninstall.id });
      if (pluginToUninstall.name)
        pluginManager?.uninstallPlugin(pluginToUninstall.name);
      await loadInstalled(true);
      suppressNextPluginEventRef.current = true;
      event.emit(PLUGIN_CHANGED, { source: "uninstall" });
      toast.success(t("pluginHub.uninstall.success"));
      setPluginToUninstall(undefined);
    } catch {
      toast.error(t("pluginHub.uninstall.failed"));
    } finally {
      setPendingUninstallId(undefined);
    }
  }, [loadInstalled, pluginManager, pluginToUninstall, t]);

  const sidebar = (
    <InstalledExtensionsSidebar
      plugins={installedPlugins}
      keyword={keyword}
      loading={installedLoading}
      error={installedError}
      refreshing={refreshing}
      currentPluginId={currentPluginId}
      loadedPluginNames={loadedPluginNames}
      incompatiblePlugins={incompatiblePlugins}
      pendingUpdateId={pendingUpdateId}
      pendingUninstallId={pendingUninstallId}
      collapsed={isTablet && sidebarCollapsed}
      showUtilityActions={isMobile}
      resolveIcon={(path) => (path ? usePath(path) : "")}
      onKeywordChange={setKeyword}
      onRefresh={handleRefresh}
      onRetry={() => void loadInstalled()}
      onBrowse={browseMarketplace}
      onNavigate={navigateToPlugin}
      onUpdate={handleUpdate}
      onUninstall={setPluginToUninstall}
      onToggleCollapsed={isTablet ? toggleSidebar : undefined}
    />
  );

  const contentColumns = isTablet
    ? sidebarCollapsed
      ? "grid-cols-[56px_minmax(0,1fr)]"
      : "grid-cols-[272px_minmax(0,1fr)]"
    : "grid-cols-[288px_minmax(0,1fr)]";

  const uninstalling = Boolean(
    pluginToUninstall &&
    pendingUninstallId === pluginVersionKey(pluginToUninstall),
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background">
      <PluginHubTopBar
        installedCount={installedPlugins.length}
        onOpenInstalled={() => setSidebarOpen(true)}
      />

      <div
        className={cn(
          "min-h-0 flex-1",
          isMobile ? "flex" : cn("grid", contentColumns),
        )}
      >
        {isMobile ? (
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetContent
              side="left"
              className="w-[min(88vw,340px)] p-0 sm:max-w-none"
            >
              <SheetTitle className="sr-only">
                {t("pluginHub.sidebar.title")}
              </SheetTitle>
              <div className="h-[100dvh] pb-safe pt-safe">{sidebar}</div>
            </SheetContent>
          </Sheet>
        ) : (
          <div className="h-full min-h-0 overflow-hidden">{sidebar}</div>
        )}

        <div
          ref={outletScrollRef}
          className="min-h-0 min-w-0 flex-1 overflow-y-auto"
        >
          <Outlet />
        </div>
      </div>

      <AlertDialog
        open={Boolean(pluginToUninstall)}
        onOpenChange={(open) => {
          if (!open && !uninstalling) setPluginToUninstall(undefined);
        }}
      >
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <AlertDialogHeader>
            <div className="mb-2 flex items-start gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertCircle className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <AlertDialogTitle>
                  {t("pluginHub.uninstall.title")}
                </AlertDialogTitle>
                <AlertDialogDescription className="mt-1">
                  {t("pluginHub.uninstall.warning")}
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <div className="rounded-xl border border-border/70 bg-muted/30 p-4 text-sm leading-relaxed">
            {t("pluginHub.uninstall.description", {
              name:
                pluginToUninstall?.name ?? t("pluginHub.detail.unavailable"),
            })}
          </div>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel disabled={uninstalling} className="h-11 sm:h-10">
              {t("pluginHub.uninstall.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90 sm:h-10"
              disabled={uninstalling}
              onClick={(event) => {
                event.preventDefault();
                void confirmUninstall();
              }}
            >
              {uninstalling ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 size-4" />
              )}
              {uninstalling
                ? t("pluginHub.uninstall.pending")
                : t("pluginHub.uninstall.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
