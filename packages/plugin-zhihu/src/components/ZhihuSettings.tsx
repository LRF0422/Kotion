import React, { useState } from "react";
import {
    Badge,
    Button,
    Card,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Separator,
    Switch,
    cn,
} from "@kn/ui";
import { useTranslation } from "@kn/common";
import {
    CheckCircle2,
    Database,
    Eye,
    EyeOff,
    Flame,
    KeyRound,
    RefreshCw,
    Search,
    Sparkles,
    XCircle,
} from "@kn/icon";
import { useZhihuConfig, toZhihuServiceOptions } from "../hooks/use-zhihu-config";
import { getZhihuQuota } from "../services/zhihu-service";
import { testZhihuConnection } from "../services/zhihu-client";
import { describeZhihuError } from "../services/zhihu-errors";
import type { ZhihuQuotaItem } from "../types/zhihu";
import type { ZhihuPluginConfig } from "../types/config";
import { ZhihuLogo } from "./ZhihuLogo";

const SectionCard: React.FC<{
    icon: React.ReactNode;
    title: string;
    description?: string;
    children: React.ReactNode;
}> = ({ icon, title, description, children }) => (
    <Card className="overflow-hidden">
        <div className="flex items-center gap-2.5 border-b bg-muted/30 px-4 py-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground shadow-sm ring-1 ring-inset ring-border">
                {icon}
            </span>
            <div className="min-w-0">
                <p className="text-sm font-medium leading-tight">{title}</p>
                {description && (
                    <p className="text-xs text-muted-foreground">{description}</p>
                )}
            </div>
        </div>
        <div className="space-y-3 p-4">{children}</div>
    </Card>
);

export const ZhihuSettings: React.FC<{ pluginKey?: string }> = () => {
    const { t } = useTranslation();
    const { config, updateConfig, saving, saveError, isDirty, getSecret, isConfigured } = useZhihuConfig();

    const [showSecret, setShowSecret] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{
        success: boolean;
        error?: string;
    } | null>(null);

    const [quota, setQuota] = useState<ZhihuQuotaItem[] | null>(null);
    const [quotaLoading, setQuotaLoading] = useState(false);
    const [quotaError, setQuotaError] = useState<string | null>(null);

    /** The stored secret is masked, so "configured" means it exists server-side. */
    const secretConfigured = isConfigured("accessSecret");

    /**
     * Service options carrying the credential. The config in form state holds
     * the mask for an untouched secret, so the real value is resolved on demand.
     */
    const resolveServiceOptions = async () => {
        const accessSecret = await getSecret("accessSecret");
        return { ...toZhihuServiceOptions(config), accessSecret };
    };

    const handleRefreshQuota = async () => {
        setQuotaLoading(true);
        setQuotaError(null);
        try {
            const items = await getZhihuQuota(await resolveServiceOptions());
            setQuota(items);
        } catch (error) {
            setQuotaError(describeZhihuError(error));
        } finally {
            setQuotaLoading(false);
        }
    };

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);
        const result = await testZhihuConnection(await resolveServiceOptions());
        setTestResult(result);
        setTesting(false);
        if (result.success) void handleRefreshQuota();
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border bg-gradient-to-br from-muted/60 to-transparent p-4">
                <ZhihuLogo size={44} label={t("zhihu.title")} />
                <div className="min-w-0">
                    <p className="text-sm font-medium">
                        {t("zhihu.brand.title")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                        {t("zhihu.brand.description")}
                    </p>
                </div>
            </div>

            <SectionCard
                icon={<KeyRound className="h-4 w-4" />}
                title={t("zhihu.auth.title")}
                description={t("zhihu.auth.description")}
            >
                <div className="space-y-1.5">
                    <Label className="text-xs" htmlFor="zhihu-access-secret">
                        {t("zhihu.auth.secretLabel")}
                    </Label>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Input
                                id="zhihu-access-secret"
                                type={showSecret ? "text" : "password"}
                                autoComplete="new-password"
                                placeholder={
                                    secretConfigured
                                        ? t("zhihu.auth.secretConfiguredPlaceholder")
                                        : t("zhihu.auth.secretPlaceholder")
                                }
                                value={
                                    secretConfigured ? "" : config.accessSecret
                                }
                                onChange={(e) =>
                                    updateConfig({ accessSecret: e.target.value })
                                }
                                className="pr-9 font-mono text-xs"
                            />
                            <button
                                type="button"
                                onClick={() => setShowSecret(!showSecret)}
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                                aria-label={
                                    showSecret
                                        ? t("zhihu.auth.hide")
                                        : t("zhihu.auth.show")
                                }
                            >
                                {showSecret ? (
                                    <EyeOff className="h-3.5 w-3.5" />
                                ) : (
                                    <Eye className="h-3.5 w-3.5" />
                                )}
                            </button>
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleTest}
                            disabled={testing || !secretConfigured}
                            className="shrink-0"
                        >
                            {testing ? (
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                t("zhihu.auth.test")
                            )}
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {t("zhihu.auth.hint")}
                    </p>
                </div>

                {testResult && (
                    <div
                        className={cn(
                            "flex items-center gap-2 rounded-md border px-3 py-2 text-xs",
                            testResult.success
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                                : "border-red-500/30 bg-red-500/10 text-red-600",
                        )}
                    >
                        {testResult.success ? (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                            <XCircle className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <span className="min-w-0 break-all">
                            {testResult.success
                                ? t("zhihu.auth.success")
                                : testResult.error || t("zhihu.auth.failure")}
                        </span>
                    </div>
                )}

                <div className="space-y-1.5">
                    <Label className="text-xs" htmlFor="zhihu-base-url">
                        {t("zhihu.auth.baseUrlLabel")}
                    </Label>
                    <Input
                        id="zhihu-base-url"
                        autoComplete="off"
                        value={config.baseUrl}
                        onChange={(e) =>
                            updateConfig({ baseUrl: e.target.value })
                        }
                        className="font-mono text-xs"
                    />
                </div>
            </SectionCard>

            <SectionCard
                icon={<Database className="h-4 w-4" />}
                title={t("zhihu.quota.title")}
                description={t("zhihu.quota.description")}
            >
                <div className="flex items-center justify-between">
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={handleRefreshQuota}
                        disabled={quotaLoading || !secretConfigured}
                    >
                        <RefreshCw
                            className={cn(
                                "mr-1.5 h-3.5 w-3.5",
                                quotaLoading && "animate-spin",
                            )}
                        />
                        {quotaLoading
                            ? t("zhihu.quota.refreshing")
                            : t("zhihu.quota.refresh")}
                    </Button>
                    {saving && (
                        <span className="text-xs text-muted-foreground">
                            {t("zhihu.quota.saving")}
                        </span>
                    )}
                    {!saving && isDirty && (
                        <span className="text-xs text-muted-foreground">
                            {t("zhihu.quota.dirty")}
                        </span>
                    )}
                </div>

                {quotaError && (
                    <p className="text-xs text-red-500">{quotaError}</p>
                )}

                {quota && quota.length === 0 && !quotaError && (
                    <p className="text-xs text-muted-foreground">
                        {t("zhihu.quota.empty")}
                    </p>
                )}

                {quota && quota.length > 0 && (
                    <div className="space-y-1.5">
                        {quota.map((item, index) => (
                            <div
                                key={item.apiId || index}
                                className="flex items-center justify-between rounded-md border px-3 py-1.5 text-xs"
                            >
                                <span className="truncate">
                                    {item.apiName ||
                                        item.apiId ||
                                        t("zhihu.quota.unknownCapability")}
                                </span>
                                <Badge
                                    variant={
                                        item.remainQuota > 0
                                            ? "secondary"
                                            : "destructive"
                                    }
                                >
                                    {t("zhihu.quota.remaining", {
                                        remain: item.remainQuota,
                                        total: item.totalQuota,
                                    })}
                                </Badge>
                            </div>
                        ))}
                    </div>
                )}
            </SectionCard>

            <SectionCard
                icon={<Search className="h-4 w-4" />}
                title={t("zhihu.behavior.title")}
                description={t("zhihu.behavior.description")}
            >
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                        <Label className="text-xs" htmlFor="zhihu-search-count">
                            {t("zhihu.behavior.searchCount")}
                        </Label>
                        <Input
                            id="zhihu-search-count"
                            type="number"
                            autoComplete="off"
                            min={1}
                            max={10}
                            value={config.defaultSearchCount}
                            onChange={(e) =>
                                updateConfig({
                                    defaultSearchCount: Number(e.target.value),
                                })
                            }
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">
                            {t("zhihu.behavior.model")}
                        </Label>
                        <Select
                            value={config.askModel}
                            onValueChange={(value) =>
                                updateConfig({
                                    askModel:
                                        value as ZhihuPluginConfig["askModel"],
                                })
                            }
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="zhida-fast-1p5">
                                    {t("zhihu.behavior.modelFast")}
                                </SelectItem>
                                <SelectItem value="zhida-thinking-1p5">
                                    {t("zhihu.behavior.modelThinking")}
                                </SelectItem>
                                <SelectItem value="zhida-agent">
                                    {t("zhihu.behavior.modelAgent")}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                    <div className="min-w-0">
                        <p className="text-xs font-medium">
                            {t("zhihu.behavior.cache")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {t("zhihu.behavior.cacheHint")}
                        </p>
                    </div>
                    <Switch
                        checked={config.enableCache !== false}
                        onCheckedChange={(checked) =>
                            updateConfig({ enableCache: checked })
                        }
                    />
                </div>

                <div className="space-y-1.5">
                    <Label className="text-xs" htmlFor="zhihu-cache-ttl">
                        {t("zhihu.behavior.cacheTtl")}
                    </Label>
                    <Input
                        id="zhihu-cache-ttl"
                        type="number"
                        autoComplete="off"
                        min={1}
                        value={config.cacheTTLMinutes}
                        disabled={config.enableCache === false}
                        onChange={(e) =>
                            updateConfig({
                                cacheTTLMinutes: Number(e.target.value),
                            })
                        }
                    />
                </div>
            </SectionCard>

            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                    <Search className="h-3.5 w-3.5" />
                    {t("zhihu.features.search")}
                </span>
                <span className="inline-flex items-center gap-1">
                    <Flame className="h-3.5 w-3.5" />
                    {t("zhihu.features.hot")}
                </span>
                <span className="inline-flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5" />
                    {t("zhihu.features.ask")}
                </span>
            </div>

            {saveError && (
                <p className="text-xs text-red-500">
                    {t("zhihu.saveError", { message: saveError })}
                </p>
            )}
        </div>
    );
};

export default ZhihuSettings;
