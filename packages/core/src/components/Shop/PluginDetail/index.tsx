import {
  AppContext,
  APIS,
  event,
  getApiErrorMessage,
  PLUGIN_CHANGED,
  useApi,
  useNavigator,
  useParams,
  usePluginState,
  useTranslation,
  useUploadFile,
} from "@kn/common";
import { AlertCircleIcon, ArrowLeft, BoxIcon } from "@kn/icon";
import { Button, Skeleton, toast } from "@kn/ui";
import React, { useContext, useMemo, useState } from "react";
import { PluginDetailHero } from "./PluginDetailHero";
import { PluginDocumentationCard } from "./PluginDocumentationCard";
import { PluginFactsPanel } from "./PluginFactsPanel";
import { PluginRatingCard } from "./PluginRatingCard";
import { PluginReportDialog } from "./PluginReportDialog";
import { usePluginDetail } from "./use-plugin-detail";
import {
  toRemotePluginDescriptor,
  getPluginInstallState,
  normalizeDocumentationSections,
} from "../plugin-model";

const PluginDetailSkeleton = () => (
  <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 md:px-6 md:py-6 lg:px-8">
    <div className="border-b border-border/60 pb-5 sm:pb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
        <Skeleton className="size-14 shrink-0 rounded-lg sm:size-16" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-6 w-2/5" />
              <Skeleton className="h-4 w-1/4" />
            </div>
            <Skeleton className="h-10 w-full rounded-md sm:w-44" />
          </div>
          <div className="space-y-2 pt-3">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-4/5" />
          </div>
          <div className="flex gap-3 pt-3">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-3.5 w-20" />
          </div>
        </div>
      </div>
    </div>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px] xl:gap-10">
      <div className="min-w-0">
        <div className="flex items-end justify-between gap-4 border-b border-border/60 pb-2">
          <Skeleton className="h-5 w-32" />
          <div className="flex gap-3">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
        <div className="space-y-3 pt-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="space-y-3 border-t border-border/60 pt-4 first:border-t-0 first:pt-0"
          >
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

interface DetailMessageProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  onRetry?: () => void;
  onBack: () => void;
  retryLabel: string;
  backLabel: string;
}

const DetailMessage: React.FC<DetailMessageProps> = ({
  icon,
  title,
  description,
  onRetry,
  onBack,
  retryLabel,
  backLabel,
}) => (
  <div className="mx-auto flex min-h-[60vh] w-full max-w-xl items-center justify-center px-4 py-10">
    <div className="w-full text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </div>
      <h1 className="mt-4 text-lg font-semibold">{title}</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      <div className="mt-6 flex flex-col-reverse justify-center gap-2 sm:flex-row">
        <Button variant="outline" className="h-11 sm:h-10" onClick={onBack}>
          <ArrowLeft className="mr-2 size-4" />
          {backLabel}
        </Button>
        {onRetry && (
          <Button className="h-11 sm:h-10" onClick={onRetry}>
            {retryLabel}
          </Button>
        )}
      </div>
    </div>
  </div>
);

export const PluginDetail: React.FC = () => {
  const params = useParams();
  const pluginId = params.id ? String(params.id) : undefined;
  const { t } = useTranslation();
  const navigator = useNavigator();
  const { usePath } = useUploadFile();
  const { pluginManager } = useContext(AppContext);
  const { loadedPluginNames, incompatiblePlugins } = usePluginState();
  const { status, plugin, retry, refresh } = usePluginDetail(pluginId);
  const [installing, setInstalling] = useState(false);

  const installState = useMemo(
    () =>
      getPluginInstallState(
        plugin ?? {},
        loadedPluginNames,
        incompatiblePlugins,
      ),
    [incompatiblePlugins, loadedPluginNames, plugin],
  );
  const runtimePayload = useMemo(
    () => (plugin ? toRemotePluginDescriptor(plugin) : null),
    [plugin],
  );
  const documentationSections = useMemo(
    () =>
      normalizeDocumentationSections(
        plugin?.currentVersion?.versionDescription,
      ),
    [plugin?.currentVersion?.versionDescription],
  );

  const backToHub = () => navigator.go({ to: "/plugin-hub" });

  const handleInstall = async () => {
    if (
      !plugin ||
      !runtimePayload ||
      runtimePayload.versionId === undefined ||
      runtimePayload.versionId === null ||
      installState.installed ||
      installing
    ) return;

    let backendInstalled = false;
    setInstalling(true);
    try {
      // silent: this page shows the failure itself, with the backend's reason.
      await useApi(APIS.INSTALL_PLUGIN, { versionId: runtimePayload.versionId }, undefined, undefined, true);
      backendInstalled = true;
      const activated = pluginManager
        ? await pluginManager.installPlugin(runtimePayload)
        : false;

      if (activated) {
        toast.success(t("pluginHub.detail.installSuccess"));
      } else {
        toast.warning(t("pluginHub.detail.activationFailed"));
      }
    } catch (error) {
      // 例如「已安装插件数量已达套餐上限」/「插件已下架」——后端已按界面语言本地化
      toast.error(getApiErrorMessage(error, t("pluginHub.detail.installFailed")));
    } finally {
      if (backendInstalled) event.emit(PLUGIN_CHANGED, { source: "install" });
      setInstalling(false);
    }
  };

  if (status === "loading") {
    return <PluginDetailSkeleton />;
  }

  if (status === "error") {
    return (
      <DetailMessage
        icon={<AlertCircleIcon className="size-6" />}
        title={t("pluginHub.detail.loadFailed")}
        description={t("pluginHub.detail.loadFailedDesc")}
        retryLabel={t("pluginHub.detail.retry")}
        backLabel={t("pluginHub.detail.back")}
        onRetry={() => void retry()}
        onBack={backToHub}
      />
    );
  }

  if (status === "not-found" || !plugin?.id) {
    return (
      <DetailMessage
        icon={<BoxIcon className="size-6" />}
        title={t("pluginHub.detail.notFound")}
        description={t("pluginHub.detail.notFoundDesc")}
        retryLabel={t("pluginHub.detail.retry")}
        backLabel={t("pluginHub.detail.back")}
        onBack={backToHub}
      />
    );
  }

  const versionId = plugin.currentVersion?.id
    ? String(plugin.currentVersion.id)
    : plugin.currentVersionId
      ? String(plugin.currentVersionId)
      : undefined;

  return (
    <div className="min-h-full">
      <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 md:px-6 md:py-6 lg:px-8">
        <PluginDetailHero
          plugin={plugin}
          iconUrl={plugin.icon ? usePath(plugin.icon) : undefined}
          installState={installState}
          installing={installing}
          packageAvailable={
            runtimePayload?.versionId !== undefined &&
            runtimePayload.versionId !== null
          }
          onInstall={() => void handleInstall()}
        />

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_280px] xl:gap-10">
          <PluginDocumentationCard
            pluginId={String(plugin.id)}
            versionId={versionId}
            sections={documentationSections}
          />
          <div className="space-y-4">
            <PluginRatingCard plugin={plugin} onRated={() => void refresh()} />
            <PluginFactsPanel plugin={plugin} />
            <div className="border-t border-border/60 pt-3">
              <PluginReportDialog
                pluginId={plugin.id}
                pluginName={plugin.name}
                versionId={versionId}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
