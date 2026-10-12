import React, { useEffect, useState } from "react";
import { useOptionalService, useTranslation, type LocalFirstSyncStatus } from "@kn/common";
import { Badge, Button, Switch, toast } from "@kn/ui";
import { Cloud, CloudOff, Database, RefreshCw } from "@kn/icon";
import { SettingsPanel, SettingsSection, SettingsRow } from "./primitives";

/**
 * 「本地数据」设置面板。
 *
 * 桌面端的数据以本机 SQLite 为唯一权威：不登录、不联网也能完整使用，云端同步是**可选**能力
 * （默认关闭，由方案/会员门槛决定能否开启）。这里展示本地库的状态与队列长度，并提供开关、
 * 立即同步、重试失败项。Web 端没有本地库，服务缺省时给出说明而不是空白页。
 */
export const LocalData: React.FC = () => {
    const { t } = useTranslation();
    const localFirst = useOptionalService("localFirst");
    const [status, setStatus] = useState<LocalFirstSyncStatus | undefined>(undefined);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!localFirst) return;
        // `subscribe` seeds the listener, so the panel renders real state at once.
        return localFirst.subscribe(setStatus);
    }, [localFirst]);

    if (!localFirst) {
        return (
            <SettingsPanel>
                <SettingsSection title={t("settings.localData.title")} description={t("settings.localData.desc")}>
                    <SettingsRow
                        icon={<CloudOff />}
                        label={t("settings.localData.unavailable")}
                        description={t("settings.localData.unavailableHint")}
                    />
                </SettingsSection>
            </SettingsPanel>
        );
    }

    const blocked = status?.syncBlockedReason;
    const blockedText = blocked
        ? t(`settings.localData.blocked.${blocked}`, t("settings.localData.blocked.policy"))
        : undefined;

    const toggle = async (next: boolean): Promise<void> => {
        setBusy(true);
        try {
            if (next) {
                const result = await localFirst.enable();
                if (!result.enabled) {
                    toast.error(t("settings.localData.enableFailed", { reason: blockedText ?? "" }));
                }
            } else {
                await localFirst.disable();
            }
        } finally {
            setBusy(false);
        }
    };

    const syncNow = async (): Promise<void> => {
        setBusy(true);
        try {
            const next = await localFirst.syncNow();
            setStatus(next);
            if (next.lastError) toast.error(next.lastError);
            else toast.success(t("settings.localData.synced"));
        } finally {
            setBusy(false);
        }
    };

    const retry = async (): Promise<void> => {
        const count = await localFirst.retryFailed();
        toast.success(t("settings.localData.retried", { count }));
    };

    const formatTime = (value: number | null | undefined): string =>
        value ? new Date(value).toLocaleString() : t("settings.localData.never");

    return (
        <SettingsPanel>
            <SettingsSection title={t("settings.localData.title")} description={t("settings.localData.desc")}>
                <SettingsRow
                    icon={<Database />}
                    label={t("settings.localData.engine")}
                    description={
                        status
                            ? [
                                  status.engine,
                                  status.durable ? t("settings.localData.durable") : t("settings.localData.notDurable"),
                                  status.location ?? "",
                              ]
                                  .filter(Boolean)
                                  .join(" · ")
                            : t("settings.localData.loading")
                    }
                    control={
                        status ? (
                            <Badge variant={status.degraded ? "destructive" : "secondary"}>
                                {status.degraded
                                    ? t("settings.localData.degraded")
                                    : t("settings.localData.localOnly")}
                            </Badge>
                        ) : null
                    }
                />
                {status && status.spaces === 0 && status.pages === 0 && !status.syncEnabled && (
                    // 升级/新装用户最容易困惑的一屏：本地库是空的，而把云端已有内容
                    // 拉下来需要开启同步。这里说清楚原因，而不是让用户面对一个空列表。
                    <SettingsRow
                        label={t("settings.localData.emptyTitle")}
                        description={blockedText ?? t("settings.localData.emptyHint")}
                    />
                )}
                <SettingsRow
                    label={t("settings.localData.counts")}
                    description={t("settings.localData.countsHint")}
                    control={
                        status ? (
                            <span className="font-mono text-xs text-muted-foreground">
                                {t("settings.localData.countsValue", {
                                    spaces: status.spaces,
                                    pages: status.pages,
                                    blocks: status.blocks,
                                    documents: status.documents,
                                })}
                            </span>
                        ) : null
                    }
                />
            </SettingsSection>

            <SettingsSection
                title={t("settings.localData.syncTitle")}
                description={t("settings.localData.syncDesc")}
            >
                <SettingsRow
                    icon={status?.syncEnabled ? <Cloud /> : <CloudOff />}
                    label={t("settings.localData.syncToggle")}
                    description={
                        status?.syncEnabled
                            ? t("settings.localData.syncOn")
                            : blockedText ?? t("settings.localData.syncOff")
                    }
                    control={
                        <Switch
                            checked={Boolean(status?.syncEnabled)}
                            disabled={busy || (!status?.syncEnabled && Boolean(blocked))}
                            onCheckedChange={(checked) => void toggle(Boolean(checked))}
                        />
                    }
                />
                <SettingsRow
                    label={t("settings.localData.queue")}
                    description={t("settings.localData.queueHint")}
                    control={
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground">
                                {t("settings.localData.queueValue", {
                                    pending: status?.pending ?? 0,
                                    failed: status?.failed ?? 0,
                                })}
                            </span>
                            {(status?.failed ?? 0) > 0 && (
                                <Button variant="ghost" size="sm" onClick={() => void retry()}>
                                    {t("settings.localData.retry")}
                                </Button>
                            )}
                        </div>
                    }
                />
                <SettingsRow
                    label={t("settings.localData.lastSync")}
                    description={status?.lastError ?? t("settings.localData.lastSyncHint")}
                    control={
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">
                                {formatTime(status?.lastSyncAt)}
                            </span>
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={busy || !status?.syncEnabled}
                                onClick={() => void syncNow()}
                            >
                                <RefreshCw className={busy ? "animate-spin" : undefined} />
                                {t("settings.localData.syncNow")}
                            </Button>
                        </div>
                    }
                />
            </SettingsSection>
        </SettingsPanel>
    );
};

export default LocalData;
