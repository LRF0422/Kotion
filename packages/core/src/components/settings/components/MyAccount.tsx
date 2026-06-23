import { GlobalState } from "@kn/common";
import React from "react";
import { useSelector, useTranslation } from "@kn/common";
import { UserAvatar } from "../../UserAvatar";
import { Input } from "@kn/ui";
import { Button } from "@kn/ui";
import { Label } from "@kn/ui";
import { Badge } from "@kn/ui";
import { Camera, Mail, Lock, Shield, Trash2, MapPin, Briefcase, Building2 } from "@kn/icon";
import { useSafeState } from "ahooks";
import { SettingsPanel, SettingsSection, SettingsRow } from "./primitives";

export const MyAccount: React.FC = () => {
    const { userInfo } = useSelector((state: GlobalState) => state);
    const { t } = useTranslation();
    const [isEditing, setIsEditing] = useSafeState(false);
    const [formData, setFormData] = useSafeState({
        name: userInfo?.name || "",
        job: userInfo?.job || "",
        organization: userInfo?.organization || "",
        location: userInfo?.location || "",
    });

    const handleInputChange = (field: string, value: string) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    return (
        <SettingsPanel>
            {/* 个人资料 */}
            <SettingsSection
                title={t("settings.account.profileTitle")}
                description={t("settings.account.profileDesc")}
                action={
                    <Button
                        variant={isEditing ? "default" : "outline"}
                        size="sm"
                        onClick={() => setIsEditing(!isEditing)}
                    >
                        {isEditing ? t("settings.account.save") : t("settings.account.edit")}
                    </Button>
                }
                bare
            >
                <div className="space-y-5 rounded-xl border border-border/60 bg-card p-5">
                    {/* 头像 */}
                    <div className="flex items-center gap-4">
                        <div className="group relative">
                            <UserAvatar userInfo={userInfo} className="h-16 w-16" />
                            <button className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                                <Camera className="h-5 w-5 text-white" />
                            </button>
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                                <h3 className="truncate text-base font-semibold text-foreground">
                                    {userInfo?.name}
                                </h3>
                                <Badge variant="secondary" className="shrink-0 px-1.5 text-[10px] font-normal">
                                    {t("settings.planFree")}
                                </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">@{userInfo?.account}</p>
                        </div>
                    </div>

                    {/* 资料字段 */}
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label={t("settings.account.fieldName")}>
                            <Input
                                value={formData.name}
                                onChange={(e) => handleInputChange("name", e.target.value)}
                                disabled={!isEditing}
                                className="h-9"
                            />
                        </Field>
                        <Field label={t("settings.account.fieldJob")} icon={<Briefcase className="h-3.5 w-3.5" />}>
                            <Input
                                placeholder={t("settings.account.fieldJobPlaceholder")}
                                value={formData.job}
                                onChange={(e) => handleInputChange("job", e.target.value)}
                                disabled={!isEditing}
                                className="h-9"
                            />
                        </Field>
                        <Field label={t("settings.account.fieldOrg")} icon={<Building2 className="h-3.5 w-3.5" />}>
                            <Input
                                placeholder={t("settings.account.fieldOrgPlaceholder")}
                                value={formData.organization}
                                onChange={(e) => handleInputChange("organization", e.target.value)}
                                disabled={!isEditing}
                                className="h-9"
                            />
                        </Field>
                        <Field label={t("settings.account.fieldLocation")} icon={<MapPin className="h-3.5 w-3.5" />}>
                            <Input
                                placeholder={t("settings.account.fieldLocationPlaceholder")}
                                value={formData.location}
                                onChange={(e) => handleInputChange("location", e.target.value)}
                                disabled={!isEditing}
                                className="h-9"
                            />
                        </Field>
                    </div>
                </div>
            </SettingsSection>

            {/* 账号安全 */}
            <SettingsSection
                title={t("settings.account.securityTitle")}
                description={t("settings.account.securityDesc")}
            >
                <SettingsRow
                    icon={<Mail />}
                    label={t("settings.account.email")}
                    description={userInfo?.email || t("settings.account.emailUnset")}
                    control={
                        <Button variant="outline" size="sm">
                            {t("settings.account.change")}
                        </Button>
                    }
                />
                <SettingsRow
                    icon={<Lock />}
                    label={t("settings.account.password")}
                    description={t("settings.account.passwordHint")}
                    control={
                        <Button variant="outline" size="sm">
                            {t("settings.account.change")}
                        </Button>
                    }
                />
                <SettingsRow
                    icon={<Shield />}
                    label={t("settings.account.twoFactor")}
                    description={t("settings.account.twoFactorDesc")}
                    control={
                        <Badge variant="outline" className="font-normal text-muted-foreground">
                            {t("settings.account.twoFactorDisabled")}
                        </Badge>
                    }
                />
            </SettingsSection>

            {/* 危险区域 */}
            <SettingsSection
                title={t("settings.account.dangerTitle")}
                description={t("settings.account.dangerDesc")}
                tone="destructive"
            >
                <SettingsRow
                    icon={<Trash2 className="text-destructive" />}
                    label={<span className="text-destructive">{t("settings.account.deleteAccount")}</span>}
                    description={t("settings.account.deleteAccountDesc")}
                    control={
                        <Button variant="destructive" size="sm">
                            {t("settings.account.deleteAccount")}
                        </Button>
                    }
                />
            </SettingsSection>
        </SettingsPanel>
    );
};

const Field: React.FC<React.PropsWithChildren<{ label: string; icon?: React.ReactNode }>> = ({
    label,
    icon,
    children,
}) => (
    <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {icon}
            {label}
        </Label>
        {children}
    </div>
);
