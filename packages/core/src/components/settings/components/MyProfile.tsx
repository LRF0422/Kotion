import { AgentClient, useTranslation } from "@kn/common";
import type { AgentProfileEvidence, AgentProfileTrait } from "@kn/common";
import { Badge, Button, Input, Switch, toast } from "@kn/ui";
import React, { useCallback, useEffect, useState } from "react";
import { SettingsPanel, SettingsRow, SettingsSection } from "./primitives";

const client = new AgentClient();

/** Local labels for the add selector; trait rows use the backend label. */
const DIMENSION_LABELS: Record<string, string> = {
    occupation: "职业",
    industry: "行业",
    expertise: "专业主题",
    tech_stack: "技术栈",
    content_topic: "内容兴趣",
    content_format: "内容形式偏好",
    interaction_pref: "交互偏好",
    active_hours: "活跃时段",
};

const labelOf = (dimension: string): string => DIMENSION_LABELS[dimension] || dimension;

/**
 * 「我的画像」— low-sensitivity traits derived from the user's AI sessions.
 *
 * The user owns this data: they opt in, see every trait and its evidence, and
 * can edit / delete / purge at any time. Deleting a trait leaves a backend
 * tombstone, so it can never be re-derived behind the user's back.
 */
export const MyProfile: React.FC = () => {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [consent, setConsent] = useState(false);
    const [traits, setTraits] = useState<AgentProfileTrait[]>([]);
    const [dimensions, setDimensions] = useState<string[]>(Object.keys(DIMENSION_LABELS));
    const [newDimension, setNewDimension] = useState("content_topic");
    const [newValue, setNewValue] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState("");
    const [evidence, setEvidence] = useState<Record<string, AgentProfileEvidence[]>>({});

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const profile = await client.getProfile();
            setConsent(profile.consent);
            setTraits(profile.traits || []);
            if (profile.dimensions && profile.dimensions.length > 0) {
                setDimensions(profile.dimensions);
            }
        } catch {
            toast.error(t("settings.profile.loadFailed"));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        void load();
    }, [load]);

    const toggleConsent = async (enabled: boolean) => {
        setBusy(true);
        try {
            await client.setProfileConsent(enabled);
            setConsent(enabled);
            if (!enabled) {
                setTraits([]);
                setEvidence({});
            }
            toast.success(
                enabled ? t("settings.profile.consentOn") : t("settings.profile.consentOff"),
            );
        } catch {
            toast.error(t("settings.profile.saveFailed"));
        } finally {
            setBusy(false);
        }
    };

    const addTrait = async () => {
        const value = newValue.trim();
        if (!value) return;
        setBusy(true);
        try {
            const trait = await client.addProfileTrait(newDimension, value);
            setTraits((prev) => prev.filter((x) => x.traitId !== trait.traitId).concat(trait));
            setNewValue("");
        } catch {
            toast.error(t("settings.profile.saveFailed"));
        } finally {
            setBusy(false);
        }
    };

    const startEdit = (trait: AgentProfileTrait) => {
        setEditingId(trait.traitId);
        setEditValue(trait.value);
    };

    const saveEdit = async (trait: AgentProfileTrait) => {
        const value = editValue.trim();
        if (!value) return;
        setBusy(true);
        try {
            const updated = await client.updateProfileTrait(trait.traitId, trait.dimension, value);
            setTraits((prev) => prev.map((x) => (x.traitId === trait.traitId ? updated : x)));
            setEditingId(null);
        } catch {
            toast.error(t("settings.profile.saveFailed"));
        } finally {
            setBusy(false);
        }
    };

    const removeTrait = async (trait: AgentProfileTrait) => {
        setBusy(true);
        try {
            await client.deleteProfileTrait(trait.traitId);
            setTraits((prev) => prev.filter((x) => x.traitId !== trait.traitId));
        } catch {
            toast.error(t("settings.profile.saveFailed"));
        } finally {
            setBusy(false);
        }
    };

    const toggleEvidence = async (trait: AgentProfileTrait) => {
        if (evidence[trait.traitId]) {
            setEvidence((prev) => {
                const next = { ...prev };
                delete next[trait.traitId];
                return next;
            });
            return;
        }
        try {
            const rows = await client.listProfileEvidence(trait.traitId);
            setEvidence((prev) => ({ ...prev, [trait.traitId]: rows }));
        } catch {
            toast.error(t("settings.profile.loadFailed"));
        }
    };

    const resetProfile = async () => {
        if (!window.confirm(t("settings.profile.resetConfirm"))) return;
        setBusy(true);
        try {
            await client.resetProfile();
            setTraits([]);
            setEvidence({});
            toast.success(t("settings.profile.resetDone"));
        } catch {
            toast.error(t("settings.profile.saveFailed"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <SettingsPanel>
            <SettingsSection title={t("settings.profile.consentTitle")} description={t("settings.profile.consentDesc")}>
                <SettingsRow
                    label={t("settings.profile.privacyNotice")}
                    control={
                        <Switch
                            checked={consent}
                            disabled={busy}
                            onCheckedChange={(value: boolean) => void toggleConsent(value)}
                        />
                    }
                />
            </SettingsSection>

            {consent && (
                <SettingsSection title={t("settings.profile.addTitle")} description={t("settings.profile.addDesc")}>
                    <SettingsRow
                        label={t("settings.profile.addTitle")}
                        control={
                            <div className="flex items-center gap-2">
                                <select
                                    className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                                    value={newDimension}
                                    disabled={busy}
                                    onChange={(event) => setNewDimension(event.target.value)}
                                >
                                    {dimensions.map((dimension) => (
                                        <option key={dimension} value={dimension}>
                                            {labelOf(dimension)}
                                        </option>
                                    ))}
                                </select>
                                <Input
                                    className="h-9 w-40"
                                    value={newValue}
                                    disabled={busy}
                                    placeholder={t("settings.profile.valuePlaceholder")}
                                    onChange={(event) => setNewValue(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") void addTrait();
                                    }}
                                />
                                <Button size="sm" disabled={busy || !newValue.trim()} onClick={() => void addTrait()}>
                                    {t("settings.profile.add")}
                                </Button>
                            </div>
                        }
                    />
                </SettingsSection>
            )}

            {consent && (
                <SettingsSection
                    title={t("settings.profile.title")}
                    description={t("settings.profile.desc")}
                    action={
                        <Button size="sm" variant="outline" disabled={busy || traits.length === 0} onClick={() => void resetProfile()}>
                            {t("settings.profile.reset")}
                        </Button>
                    }
                >
                    {loading ? (
                        <div className="px-4 py-6 text-sm text-muted-foreground">…</div>
                    ) : traits.length === 0 ? (
                        <div className="px-4 py-6 text-sm text-muted-foreground">{t("settings.profile.empty")}</div>
                    ) : (
                        traits.map((trait) => (
                            <div key={trait.traitId} className="px-4 py-3">
                                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-4">
                                    <div className="min-w-0 space-y-0.5">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-foreground">
                                                {trait.dimensionLabel || labelOf(trait.dimension)}
                                            </span>
                                            <Badge variant="secondary" className="text-[10px] font-normal">
                                                {trait.source === "user"
                                                    ? t("settings.profile.sourceUser")
                                                    : t("settings.profile.sourceInferred")}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground">
                                                {t("settings.profile.confidence")} {trait.confidence}
                                            </span>
                                        </div>
                                        {editingId === trait.traitId ? (
                                            <div className="flex items-center gap-2 pt-1">
                                                <Input
                                                    className="h-8 w-48"
                                                    value={editValue}
                                                    onChange={(event) => setEditValue(event.target.value)}
                                                    onKeyDown={(event) => {
                                                        if (event.key === "Enter") void saveEdit(trait);
                                                        if (event.key === "Escape") setEditingId(null);
                                                    }}
                                                />
                                                <Button size="sm" disabled={busy} onClick={() => void saveEdit(trait)}>
                                                    {t("settings.profile.save")}
                                                </Button>
                                                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                                                    {t("settings.profile.cancel")}
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="text-sm text-muted-foreground">{trait.value}</div>
                                        )}
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1">
                                        <Button size="sm" variant="ghost" onClick={() => startEdit(trait)}>
                                            {t("settings.profile.edit")}
                                        </Button>
                                        <Button size="sm" variant="ghost" onClick={() => void toggleEvidence(trait)}>
                                            {t("settings.profile.evidence")}
                                        </Button>
                                        <Button size="sm" variant="ghost" onClick={() => void removeTrait(trait)}>
                                            {t("settings.profile.delete")}
                                        </Button>
                                    </div>
                                </div>
                                {evidence[trait.traitId] && (
                                    <div className="mt-2 space-y-1 rounded-md bg-muted/40 px-3 py-2">
                                        <div className="text-xs font-medium text-muted-foreground">
                                            {t("settings.profile.evidenceTitle")}
                                        </div>
                                        {evidence[trait.traitId].length === 0 ? (
                                            <div className="text-xs text-muted-foreground">
                                                {t("settings.profile.evidenceEmpty")}
                                            </div>
                                        ) : (
                                            evidence[trait.traitId].map((item, index) => (
                                                <div key={index} className="text-xs text-muted-foreground">
                                                    {item.excerpt || "—"}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </SettingsSection>
            )}
        </SettingsPanel>
    );
};
