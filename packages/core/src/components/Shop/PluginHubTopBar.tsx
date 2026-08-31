import { useLocation, useNavigator, useTranslation } from "@kn/common";
import { ArrowLeft, Package, PlusSquare, Settings } from "@kn/icon";
import { Badge, Button } from "@kn/ui";
import React from "react";
import { PluginManager } from "./PluginManager";
import { PluginUploader } from "./PluginUploader";

interface PluginHubTopBarProps {
  installedCount: number;
  onOpenInstalled: () => void;
}

export const PluginHubTopBar: React.FC<PluginHubTopBarProps> = ({
  installedCount,
  onOpenInstalled,
}) => {
  const { t } = useTranslation();
  const navigator = useNavigator();
  const { pathname } = useLocation();
  const isDetail = pathname.startsWith("/plugin-hub/");

  return (
    <header className="titlebar-drag-region relative z-[60] flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/70 bg-background px-3 md:px-4 lg:px-5">
      <div className="titlebar-no-drag flex min-w-0 items-center gap-1.5">
        {isDetail ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="size-11 shrink-0 lg:size-9"
              onClick={() => navigator.go({ to: "/plugin-hub" })}
              aria-label={t("pluginHub.back")}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <button
                type="button"
                className="hidden truncate font-medium text-muted-foreground transition-colors hover:text-foreground md:block"
                onClick={() => navigator.go({ to: "/plugin-hub" })}
              >
                {t("pluginHub.title")}
              </button>
              <span className="hidden text-border md:inline">/</span>
              <span className="truncate font-semibold text-foreground">
                {t("pluginHub.detailBreadcrumb")}
              </span>
            </div>
          </>
        ) : (
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Package className="size-4" />
            </div>
            <h1 className="truncate text-sm font-semibold">
              {t("pluginHub.title")}
            </h1>
          </div>
        )}
      </div>

      <div className="titlebar-no-drag flex shrink-0 items-center gap-1.5">
        <div className="hidden items-center gap-1.5 md:flex">
          <PluginUploader>
            <Button variant="ghost" className="h-11 gap-2 px-3 text-xs lg:h-9">
              <PlusSquare className="size-4" />
              <span className="hidden lg:inline">{t("pluginHub.publish")}</span>
            </Button>
          </PluginUploader>
          <PluginManager>
            <Button
              variant="outline"
              className="h-11 gap-2 px-3 text-xs lg:h-9"
            >
              <Settings className="size-4" />
              <span className="hidden lg:inline">{t("pluginHub.manage")}</span>
            </Button>
          </PluginManager>
        </div>

        <Button
          variant="secondary"
          className="h-11 gap-2 px-3 text-xs md:hidden"
          onClick={onOpenInstalled}
        >
          <Package className="size-4" />
          {t("pluginHub.openInstalled")}
          <Badge className="h-5 min-w-5 justify-center px-1.5 text-[10px] tabular-nums">
            {installedCount}
          </Badge>
        </Button>
      </div>
    </header>
  );
};
