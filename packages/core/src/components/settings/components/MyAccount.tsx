import {
    APIS,
    GlobalState,
    UpdatePasswordBody,
    UpdateProfileBody,
    clearContextSensitiveClientState,
    clearTokens,
    notifyContextChanged,
    useApi,
    useDispatch,
    useSelector,
    useTranslation,
    useUploadFile,
} from "@kn/common";
import { Camera, Lock, Mail } from "@kn/icon";
import {
    Avatar,
    AvatarFallback,
    AvatarImage,
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
    Label,
    toast,
} from "@kn/ui";
import React, { useEffect, useRef, useState } from "react";
import { SettingsPanel, SettingsRow, SettingsSection } from "./primitives";

type ProfileDraft = UpdateProfileBody;

const emptyPassword: UpdatePasswordBody = {
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
};

export const MyAccount: React.FC = () => {
    const { userInfo } = useSelector((state: GlobalState) => state);
    const dispatch = useDispatch();
    const { t } = useTranslation();
    const { uploadFile, usePath } = useUploadFile();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [avatarFile, setAvatarFile] = useState<File>();
    const [avatarPreview, setAvatarPreview] = useState("");
    const [passwordOpen, setPasswordOpen] = useState(false);
    const [passwordSaving, setPasswordSaving] = useState(false);
    const [password, setPassword] = useState<UpdatePasswordBody>(emptyPassword);
    const [formData, setFormData] = useState<ProfileDraft>({ name: "", realName: "", avatar: "" });

    useEffect(() => {
        setFormData({
            name: userInfo?.name || "",
            realName: userInfo?.realName || "",
            avatar: userInfo?.avatar || "",
        });
        setAvatarFile(undefined);
        setAvatarPreview("");
        setIsEditing(false);
    }, [userInfo?.id, userInfo?.name, userInfo?.realName, userInfo?.avatar]);

    useEffect(() => () => {
        if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    }, [avatarPreview]);

    const resetDraft = () => {
        setFormData({
            name: userInfo?.name || "",
            realName: userInfo?.realName || "",
            avatar: userInfo?.avatar || "",
        });
        setAvatarFile(undefined);
        setAvatarPreview("");
        setIsEditing(false);
    };

    const saveProfile = async () => {
        const name = formData.name.trim();
        if (!name) {
            toast.error(t("settings.account.nameRequired"));
            return;
        }
        setSaving(true);
        try {
            let avatar = formData.avatar;
            if (avatarFile) {
                const uploaded = await uploadFile(avatarFile);
                avatar = uploaded.name;
                setFormData(prev => ({ ...prev, avatar }));
                setAvatarFile(undefined);
                setAvatarPreview("");
            }
            const res = await useApi(APIS.UPDATE_ME_PROFILE, undefined, {
                name,
                realName: formData.realName.trim(),
                avatar,
            });
            dispatch({ type: "UPDATE_USER", payload: res.data });
            setIsEditing(false);
            toast.success(t("settings.account.profileSaved"));
        } finally {
            setSaving(false);
        }
    };

    const handleAvatar = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        setAvatarFile(file);
        setAvatarPreview(URL.createObjectURL(file));
    };

    const updatePassword = async () => {
        if (password.newPassword.length < 6) {
            toast.error(t("settings.account.passwordLength"));
            return;
        }
        if (password.newPassword !== password.confirmPassword) {
            toast.error(t("settings.account.passwordMismatch"));
            return;
        }
        setPasswordSaving(true);
        try {
            await useApi(APIS.UPDATE_ME_PASSWORD, undefined, password);
            setPassword(emptyPassword);
            setPasswordOpen(false);
            toast.success(t("settings.account.passwordSaved"));
            clearContextSensitiveClientState();
            clearTokens();
            notifyContextChanged("");
            window.location.assign('/login');
        } finally {
            setPasswordSaving(false);
        }
    };

    return (
        <SettingsPanel>
            <SettingsSection
                title={t("settings.account.profileTitle")}
                description={t("settings.account.profileDesc")}
                action={
                    isEditing ? (
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="h-11 lg:h-9" onClick={resetDraft} disabled={saving}>
                                {t("settings.account.cancel")}
                            </Button>
                            <Button size="sm" className="h-11 lg:h-9" onClick={saveProfile} disabled={saving}>
                                {saving ? t("settings.account.saving") : t("settings.account.save")}
                            </Button>
                        </div>
                    ) : (
                        <Button variant="outline" size="sm" className="h-11 lg:h-9" onClick={() => setIsEditing(true)}>
                            {t("settings.account.edit")}
                        </Button>
                    )
                }
                bare
            >
                <div className="space-y-5 rounded-xl border border-border/60 bg-card p-4 md:p-5">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <Avatar className="h-16 w-16">
                                <AvatarImage src={avatarPreview || usePath(formData.avatar)} />
                                <AvatarFallback>{(userInfo?.account || userInfo?.name || "U").slice(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            {isEditing && (
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="icon"
                                    className="absolute -bottom-2 -right-2 h-11 w-11 rounded-full lg:h-9 lg:w-9"
                                    aria-label={t("settings.account.changeAvatar")}
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={saving}
                                >
                                    <Camera className="h-4 w-4" />
                                </Button>
                            )}
                            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatar} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h3 className="truncate text-base font-semibold text-foreground">{formData.name || userInfo?.account}</h3>
                            <p className="truncate text-xs text-muted-foreground">@{userInfo?.account}</p>
                        </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        <Field label={t("settings.account.fieldName")}>
                            <Input
                                value={formData.name}
                                maxLength={64}
                                onChange={event => setFormData(prev => ({ ...prev, name: event.target.value }))}
                                disabled={!isEditing}
                                className="h-11 lg:h-9"
                            />
                        </Field>
                        <Field label={t("settings.account.fieldRealName")}>
                            <Input
                                value={formData.realName}
                                maxLength={64}
                                onChange={event => setFormData(prev => ({ ...prev, realName: event.target.value }))}
                                disabled={!isEditing}
                                className="h-11 lg:h-9"
                            />
                        </Field>
                    </div>
                </div>
            </SettingsSection>

            <SettingsSection title={t("settings.account.securityTitle")} description={t("settings.account.securityDesc")}>
                <SettingsRow
                    icon={<Mail />}
                    label={t("settings.account.email")}
                    description={userInfo?.email || t("settings.account.emailUnset")}
                    control={<span className="text-xs text-muted-foreground">{t("settings.account.readOnly")}</span>}
                />
                <SettingsRow
                    icon={<Lock />}
                    label={t("settings.account.password")}
                    description={t("settings.account.passwordHint")}
                    control={
                        <Button variant="outline" size="sm" className="h-11 lg:h-9" onClick={() => setPasswordOpen(true)}>
                            {t("settings.account.change")}
                        </Button>
                    }
                />
            </SettingsSection>

            <Dialog open={passwordOpen} onOpenChange={open => {
                setPasswordOpen(open);
                if (!open) setPassword(emptyPassword);
            }}>
                <DialogContent className="md:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t("settings.account.passwordDialogTitle")}</DialogTitle>
                        <DialogDescription>{t("settings.account.passwordDialogDesc")}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <PasswordField label={t("settings.account.oldPassword")} value={password.oldPassword} onChange={oldPassword => setPassword(prev => ({ ...prev, oldPassword }))} />
                        <PasswordField label={t("settings.account.newPassword")} value={password.newPassword} onChange={newPassword => setPassword(prev => ({ ...prev, newPassword }))} />
                        <PasswordField label={t("settings.account.confirmPassword")} value={password.confirmPassword} onChange={confirmPassword => setPassword(prev => ({ ...prev, confirmPassword }))} />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" className="h-11" onClick={() => { setPassword(emptyPassword); setPasswordOpen(false); }} disabled={passwordSaving}>
                            {t("settings.account.cancel")}
                        </Button>
                        <Button className="h-11" onClick={updatePassword} disabled={passwordSaving || !password.oldPassword || !password.newPassword || !password.confirmPassword}>
                            {passwordSaving ? t("settings.account.saving") : t("settings.account.updatePassword")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </SettingsPanel>
    );
};

const Field: React.FC<React.PropsWithChildren<{ label: string }>> = ({ label, children }) => (
    <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
        {children}
    </div>
);

const PasswordField: React.FC<{ label: string; value: string; onChange: (value: string) => void }> = ({ label, value, onChange }) => (
    <div className="space-y-1.5">
        <Label>{label}</Label>
        <Input type="password" autoComplete="new-password" value={value} onChange={event => onChange(event.target.value)} className="h-11" />
    </div>
);
