import {
  AppContext,
  APIS,
  event,
  PLUGIN_CHANGED,
  useApi,
  useNavigator,
  useParams,
  usePluginState,
  useTranslation,
  useUploadFile,
} from "@kn/common";
import { AlertCircleIcon, ArrowLeft, BoxIcon } from "@kn/icon";
import { Button, Card, Skeleton, toast } from "@kn/ui";
import React, { useContext, useMemo, useState } from "react";
import { PluginDetailHero } from "./PluginDetailHero";
import { PluginDocumentationCard } from "./PluginDocumentationCard";
import { PluginFactsPanel } from "./PluginFactsPanel";
import { usePluginDetail } from "./use-plugin-detail";
import {
  toRemotePluginDescriptor,
  getPluginInstallState,
  normalizeDocumentationSections,
} from "../plugin-model";

const PluginDetailSkeleton = () => (
  <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-5 md:px-6 md:py-6 lg:px-8 lg:py-8">
    <Card className="overflow-hidden border-border/70 p-5 shadow-sm md:p-6 lg:p-7">
      <div className="grid gap-5 md:grid-cols-[96px_minmax(0,1fr)] xl:grid-cols-[112px_minmax(0,1fr)_180px] xl:gap-7">
        <Skeleton className="size-20 rounded-2xl md:size-24 xl:size-28" />
        <div className="space-y-3">
          <Skeleton className="h-8 w-2/5" />
          <Skeleton className="h-4 w-1/4" />
          <div className="space-y-2 pt-2">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-4/5" />
          </div>
          <div className="flex gap-2 pt-2">
            <Skeleton className="h-8 w-24 rounded-full" />
            <Skeleton className="h-8 w-16 rounded-full" />
            <Skeleton className="h-8 w-20 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-11 w-full rounded-lg md:col-start-2 md:w-44 xl:col-start-auto" />
      </div>
    </Card>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <Card className="min-h-[480px] overflow-hidden border-border/70 shadow-none">
        <div className="border-b p-5">
          <Skeleton className="h-5 w-32" />
          <div className="mt-4 flex gap-3">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
        <div className="space-y-3 p-6">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </Card>
      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, index) => (
          <Card
            key={index}
            className="space-y-3 border-border/70 p-4 shadow-none"
          >
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-px w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-full" />
          </Card>
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
    <div className="w-full rounded-2xl border border-border/70 bg-card p-7 text-center shadow-sm">
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
  const { status, plugin, retry } = usePluginDetail(pluginId);
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
      await useApi(APIS.INSTALL_PLUGIN, { versionId: runtimePayload.versionId });
      backendInstalled = true;
      const activated = pluginManager
        ? await pluginManager.installPlugin(runtimePayload)
        : false;

      if (activated) {
        toast.success(t("pluginHub.detail.installSuccess"));
      } else {
        toast.warning(t("pluginHub.detail.activationFailed"));
      }
    } catch {
      toast.error(t("pluginHub.detail.installFailed"));
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
    <div className="min-h-full bg-muted/10">
      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-5 md:px-6 md:py-6 lg:px-8 lg:py-8">
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

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <PluginDocumentationCard
            pluginId={String(plugin.id)}
            versionId={versionId}
            sections={documentationSections}
          />
          <PluginFactsPanel plugin={plugin} />
        </div>
      </div>
    </div>
  );
};
