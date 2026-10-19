import {
    Alert,
    AlertDescription,
    AlertTitle,
    Badge,
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Separator,
    Textarea,
    useToast,
} from '@kn/ui'
import {
    AlertCircle,
    BadgeCheck,
    CheckCircle2,
    Clock,
    Loader2,
    ShieldAlert,
    ShieldCheck,
    Upload,
    X,
} from '@kn/icon'
import { useTranslation, useUploadFile } from '@kn/common'
import React from 'react'

import {
    applyDeveloperVerification,
    developerStatus,
    useDeveloperProfile,
    type DeveloperApplyInput,
    type DeveloperIdType,
    type DeveloperProfile,
} from './developer-api'

const ID_TYPES: DeveloperIdType[] = ['ID_CARD', 'PASSPORT', 'BUSINESS_LICENSE', 'OTHER']
const MAX_FILE_SIZE = 10 * 1024 * 1024
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[0-9+\-\s()]{5,32}$/

interface FormState {
    displayName: string
    contactName: string
    contactEmail: string
    contactPhone: string
    idType: DeveloperIdType
    idNumber: string
    intro: string
    qualificationPath: string
    qualificationName: string
}

const emptyForm = (): FormState => ({
    displayName: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    idType: 'ID_CARD',
    idNumber: '',
    intro: '',
    qualificationPath: '',
    qualificationName: '',
})

const formFromProfile = (profile: DeveloperProfile | null): FormState => {
    const base = emptyForm()
    if (!profile) return base
    return {
        ...base,
        displayName: profile.displayName ?? '',
        contactName: profile.contactName ?? '',
        contactEmail: profile.contactEmail ?? '',
        contactPhone: profile.contactPhone ?? '',
        idType: (typeof profile.idType === 'string'
            ? profile.idType
            : profile.idType?.value) ?? 'ID_CARD',
        // The raw number never comes back; a resubmission re-enters it.
        idNumber: '',
        intro: profile.intro ?? '',
        qualificationPath: profile.qualificationPath ?? '',
        qualificationName: profile.qualificationPath?.split(/[\\/]/).pop() ?? '',
    }
}

const formatDateTime = (value?: string) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export interface DeveloperVerificationDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Continue the action the user was blocked from (publish / manage). */
    onVerified?: () => void
    /** Why the dialog opened, e.g. "发布插件". */
    reason?: string
}

/**
 * Developer verification gate.
 *
 * Shows the submission form when there is no profile, the review status while
 * pending, the rejection reason when rejected/revoked, and a success panel once
 * approved. Resubmitting never loses the previously entered profile data.
 */
export const DeveloperVerificationDialog: React.FC<DeveloperVerificationDialogProps> = ({
    open,
    onOpenChange,
    onVerified,
    reason,
}) => {
    const { t } = useTranslation()
    const { toast } = useToast()
    const { profile, loading, error, verified, refresh } = useDeveloperProfile()
    const { uploadFile } = useUploadFile()
    const [form, setForm] = React.useState<FormState>(() => formFromProfile(profile))
    const [formError, setFormError] = React.useState<string>()
    const [uploading, setUploading] = React.useState(false)
    const [submitting, setSubmitting] = React.useState(false)
    const fileRef = React.useRef<HTMLInputElement | null>(null)

    const status = developerStatus(profile)
    const editable = !status || status === 'REJECTED' || status === 'SUSPENDED'

    // Refresh when the dialog opens; the shared snapshot may be minutes old.
    React.useEffect(() => {
        if (!open) return
        void refresh()
    }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

    // Seed the form from the profile only when it becomes available or changes
    // identity — never while the user is typing (the store re-renders on every
    // unrelated plugin action too).
    const profileKey = profile ? `${profile.id ?? ''}:${profile.updateTime ?? ''}:${status ?? ''}` : 'none'
    React.useEffect(() => {
        if (!open) return
        setForm(formFromProfile(profile))
        setFormError(undefined)
    }, [open, profileKey]) // eslint-disable-line react-hooks/exhaustive-deps

    const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm((current) => ({ ...current, [key]: value }))
        setFormError(undefined)
    }

    const validate = (): string | undefined => {
        const required = t('developerVerification.validation.required', '请填写完整信息')
        if (!form.displayName.trim() || !form.contactName.trim() || !form.contactPhone.trim()) return required
        if (!EMAIL_RE.test(form.contactEmail.trim())) {
            return t('developerVerification.validation.email', '邮箱格式不正确')
        }
        if (!PHONE_RE.test(form.contactPhone.trim())) {
            return t('developerVerification.validation.phone', '电话格式不正确')
        }
        if (!form.idNumber.trim()) return required
        return undefined
    }

    const handleUpload = async (file: File | undefined) => {
        if (!file) return
        if (file.size > MAX_FILE_SIZE) {
            setFormError(t('developerVerification.validation.fileTooLarge', '文件不能超过 10MB'))
            return
        }
        setUploading(true)
        setFormError(undefined)
        try {
            const uploaded = await uploadFile(file)
            update('qualificationPath', uploaded.name)
            update('qualificationName', uploaded.originalName || file.name)
        } catch (uploadError) {
            setFormError(
                uploadError instanceof Error
                    ? uploadError.message
                    : t('developerVerification.validation.uploadFailed', '材料上传失败'),
            )
        } finally {
            setUploading(false)
            if (fileRef.current) fileRef.current.value = ''
        }
    }

    const handleSubmit = async () => {
        if (submitting) return
        const invalid = validate()
        if (invalid) {
            setFormError(invalid)
            return
        }
        const input: DeveloperApplyInput = {
            displayName: form.displayName.trim(),
            contactName: form.contactName.trim(),
            contactEmail: form.contactEmail.trim(),
            contactPhone: form.contactPhone.trim(),
            idType: form.idType,
            idNumber: form.idNumber.trim(),
            intro: form.intro.trim() || undefined,
            qualificationPath: form.qualificationPath || undefined,
        }
        setSubmitting(true)
        setFormError(undefined)
        try {
            await applyDeveloperVerification(input)
            toast({ title: t('developerVerification.submitSuccess', '认证资料已提交，请等待审核') })
            setForm(emptyForm())
        } catch (submitError) {
            setFormError(
                submitError instanceof Error
                    ? submitError.message
                    : t('developerVerification.submitFailed', '提交失败，请稍后重试'),
            )
        } finally {
            setSubmitting(false)
        }
    }

    const statusBadge = () => {
        if (verified) {
            return (
                <Badge className="border-transparent bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    <BadgeCheck className="mr-1 size-3.5" />
                    {t('developerVerification.status.approved', '已认证')}
                </Badge>
            )
        }
        if (status === 'PENDING') {
            return (
                <Badge className="border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400">
                    <Clock className="mr-1 size-3.5" />
                    {t('developerVerification.status.pending', '审核中')}
                </Badge>
            )
        }
        if (status === 'REJECTED') {
            return (
                <Badge className="border-transparent bg-red-500/15 text-red-600 dark:text-red-400">
                    <ShieldAlert className="mr-1 size-3.5" />
                    {t('developerVerification.status.rejected', '已驳回')}
                </Badge>
            )
        }
        if (status === 'SUSPENDED') {
            return (
                <Badge className="border-transparent bg-red-500/15 text-red-600 dark:text-red-400">
                    <ShieldAlert className="mr-1 size-3.5" />
                    {t('developerVerification.status.suspended', '已撤销')}
                </Badge>
            )
        }
        return (
            <Badge variant="outline">
                <ShieldCheck className="mr-1 size-3.5" />
                {t('developerVerification.status.none', '未认证')}
            </Badge>
        )
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
                <DialogHeader className="shrink-0 space-y-2 border-b px-5 py-4 text-left">
                    <DialogTitle className="flex items-center gap-2">
                        <ShieldCheck className="size-5 text-primary" />
                        {t('developerVerification.title', '开发者认证')}
                        {statusBadge()}
                    </DialogTitle>
                    <DialogDescription>
                        {reason
                            ? t('developerVerification.reason', {
                                  defaultValue: '{{action}}需要先完成开发者认证',
                                  action: reason,
                              })
                            : t(
                                  'developerVerification.description',
                                  '完成开发者认证后，才能发布插件、发布新版本和管理已上架的插件。',
                              )}
                    </DialogDescription>
                </DialogHeader>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                    {loading && !profile ? (
                        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                            <Loader2 className="size-4 animate-spin" />
                            {t('developerVerification.loading', '正在加载认证信息…')}
                        </div>
                    ) : error && !profile ? (
                        <Alert variant="destructive">
                            <AlertCircle className="size-4" />
                            <AlertTitle>{t('developerVerification.loadFailedTitle', '加载失败')}</AlertTitle>
                            <AlertDescription className="space-y-2">
                                <p>{error}</p>
                                <Button type="button" variant="outline" size="sm" onClick={() => void refresh()}>
                                    {t('developerVerification.retry', '重试')}
                                </Button>
                            </AlertDescription>
                        </Alert>
                    ) : verified ? (
                        <div className="space-y-4 py-2 text-center">
                            <CheckCircle2 className="mx-auto size-12 text-emerald-500" />
                            <div className="space-y-1">
                                <p className="text-base font-semibold">
                                    {t('developerVerification.approved.title', '已完成开发者认证')}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    {t(
                                        'developerVerification.approved.desc',
                                        '你现在可以发布、升级和管理插件了。',
                                    )}
                                </p>
                            </div>
                            {profile?.displayName && (
                                <p className="text-sm">
                                    {t('developerVerification.approved.as', {
                                        defaultValue: '认证开发者：{{name}}',
                                        name: profile.displayName,
                                    })}
                                </p>
                            )}
                        </div>
                    ) : status === 'PENDING' ? (
                        <div className="space-y-4 py-2">
                            <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                                <Clock className="mt-0.5 size-5 shrink-0 text-amber-600" />
                                <div className="min-w-0 space-y-1 text-sm">
                                    <p className="font-medium">
                                        {t('developerVerification.pending.title', '认证审核中')}
                                    </p>
                                    <p className="text-muted-foreground">
                                        {t(
                                            'developerVerification.pending.desc',
                                            '我们会在 1-3 个工作日内完成审核。审核期间不能发布或管理插件。',
                                        )}
                                    </p>
                                    {profile?.displayName && (
                                        <p className="text-muted-foreground">
                                            {t('developerVerification.pending.as', {
                                                defaultValue: '提交的开发者名称：{{name}}',
                                                name: profile.displayName,
                                            })}
                                        </p>
                                    )}
                                    {profile?.createTime && (
                                        <p className="text-xs text-muted-foreground">
                                            {t('developerVerification.submittedAt', {
                                                defaultValue: '提交时间：{{time}}',
                                                time: formatDateTime(profile.createTime),
                                            })}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {status === 'REJECTED' && (
                                <Alert variant="destructive">
                                    <ShieldAlert className="size-4" />
                                    <AlertTitle>
                                        {t('developerVerification.rejected.title', '认证未通过')}
                                    </AlertTitle>
                                    <AlertDescription className="space-y-1">
                                        {profile?.rejectReason && <p className="whitespace-pre-wrap">{profile.rejectReason}</p>}
                                        <p>
                                            {t(
                                                'developerVerification.rejected.desc',
                                                '请根据原因修改资料后重新提交。',
                                            )}
                                        </p>
                                    </AlertDescription>
                                </Alert>
                            )}
                            {status === 'SUSPENDED' && (
                                <Alert variant="destructive">
                                    <ShieldAlert className="size-4" />
                                    <AlertTitle>
                                        {t('developerVerification.suspended.title', '认证已被撤销')}
                                    </AlertTitle>
                                    <AlertDescription className="space-y-1">
                                        {profile?.rejectReason && <p className="whitespace-pre-wrap">{profile.rejectReason}</p>}
                                        <p>
                                            {t(
                                                'developerVerification.suspended.desc',
                                                '修改资料后可以重新提交认证。',
                                            )}
                                        </p>
                                    </AlertDescription>
                                </Alert>
                            )}

                            {!profile && (
                                <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
                                    <p className="font-medium text-foreground">
                                        {t('developerVerification.intro.title', '为什么需要开发者认证？')}
                                    </p>
                                    <p className="mt-1">
                                        {t(
                                            'developerVerification.intro.desc',
                                            '认证用于确认插件发布者身份，保障插件市场的安全与可追溯。资料仅用于审核，展示时会脱敏。',
                                        )}
                                    </p>
                                </div>
                            )}

                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="space-y-1.5 sm:col-span-2">
                                    <Label htmlFor="developer-display-name">
                                        {t('developerVerification.form.displayName', '开发者名称')}
                                    </Label>
                                    <Input
                                        id="developer-display-name"
                                        className="h-11"
                                        value={form.displayName}
                                        maxLength={64}
                                        placeholder={t(
                                            'developerVerification.form.displayNamePlaceholder',
                                            '将展示在插件详情页，例如「某某工作室」',
                                        )}
                                        onChange={(event) => update('displayName', event.target.value)}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="developer-contact-name">
                                        {t('developerVerification.form.contactName', '联系人')}
                                    </Label>
                                    <Input
                                        id="developer-contact-name"
                                        className="h-11"
                                        value={form.contactName}
                                        maxLength={64}
                                        onChange={(event) => update('contactName', event.target.value)}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="developer-contact-phone">
                                        {t('developerVerification.form.contactPhone', '联系电话')}
                                    </Label>
                                    <Input
                                        id="developer-contact-phone"
                                        className="h-11"
                                        value={form.contactPhone}
                                        maxLength={32}
                                        inputMode="tel"
                                        onChange={(event) => update('contactPhone', event.target.value)}
                                    />
                                </div>
                                <div className="space-y-1.5 sm:col-span-2">
                                    <Label htmlFor="developer-contact-email">
                                        {t('developerVerification.form.contactEmail', '联系邮箱')}
                                    </Label>
                                    <Input
                                        id="developer-contact-email"
                                        className="h-11"
                                        type="email"
                                        value={form.contactEmail}
                                        maxLength={128}
                                        onChange={(event) => update('contactEmail', event.target.value)}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="developer-id-type">
                                        {t('developerVerification.form.idType', '证件类型')}
                                    </Label>
                                    <Select
                                        value={form.idType}
                                        onValueChange={(value) => update('idType', value as DeveloperIdType)}
                                    >
                                        <SelectTrigger id="developer-id-type" className="h-11">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {ID_TYPES.map((type) => (
                                                <SelectItem key={type} value={type}>
                                                    {t(`developerVerification.idType.${type}`, type)}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="developer-id-number">
                                        {t('developerVerification.form.idNumber', '证件号码')}
                                    </Label>
                                    <Input
                                        id="developer-id-number"
                                        className="h-11"
                                        value={form.idNumber}
                                        maxLength={128}
                                        autoComplete="off"
                                        placeholder={
                                            profile?.idNumberMasked
                                                ? t('developerVerification.form.idNumberKeep', {
                                                      defaultValue: '当前：{{value}}',
                                                      value: profile.idNumberMasked,
                                                  })
                                                : undefined
                                        }
                                        onChange={(event) => update('idNumber', event.target.value)}
                                    />
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {t(
                                    'developerVerification.form.idNumberHint',
                                    '证件号仅用于人工审核，接口只返回脱敏结果；重新提交时需重新填写。',
                                )}
                            </p>

                            <div className="space-y-1.5">
                                <Label htmlFor="developer-intro">
                                    {t('developerVerification.form.intro', '开发者简介（可选）')}
                                </Label>
                                <Textarea
                                    id="developer-intro"
                                    rows={3}
                                    maxLength={1000}
                                    value={form.intro}
                                    placeholder={t(
                                        'developerVerification.form.introPlaceholder',
                                        '介绍你的团队或插件方向，便于审核。',
                                    )}
                                    onChange={(event) => update('intro', event.target.value)}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label>{t('developerVerification.form.qualification', '资质材料（可选）')}</Label>
                                <div className="flex flex-wrap items-center gap-2">
                                    <input
                                        ref={fileRef}
                                        type="file"
                                        className="hidden"
                                        accept=".pdf,.png,.jpg,.jpeg,.webp"
                                        onChange={(event) => void handleUpload(event.target.files?.[0])}
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="h-11"
                                        disabled={uploading}
                                        onClick={() => fileRef.current?.click()}
                                    >
                                        {uploading ? (
                                            <Loader2 className="mr-1.5 size-4 animate-spin" />
                                        ) : (
                                            <Upload className="mr-1.5 size-4" />
                                        )}
                                        {uploading
                                            ? t('developerVerification.form.uploading', '上传中…')
                                            : form.qualificationPath
                                              ? t('developerVerification.form.replace', '重新上传')
                                              : t('developerVerification.form.upload', '上传材料')}
                                    </Button>
                                    {form.qualificationPath && (
                                        <span className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
                                            <span className="truncate">{form.qualificationName || form.qualificationPath}</span>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="size-8 shrink-0"
                                                aria-label={t('developerVerification.form.removeFile', '移除材料')}
                                                onClick={() => {
                                                    update('qualificationPath', '')
                                                    update('qualificationName', '')
                                                }}
                                            >
                                                <X className="size-4" />
                                            </Button>
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {t(
                                        'developerVerification.form.qualificationHint',
                                        '支持 PDF / 图片，单个文件不超过 10MB。',
                                    )}
                                </p>
                            </div>

                            {formError && (
                                <Alert variant="destructive">
                                    <AlertCircle className="size-4" />
                                    <AlertTitle>{t('developerVerification.form.errorTitle', '请检查填写内容')}</AlertTitle>
                                    <AlertDescription>{formError}</AlertDescription>
                                </Alert>
                            )}
                        </div>
                    )}
                </div>

                <Separator />
                <DialogFooter className="shrink-0 gap-2 px-5 py-3">
                    {verified ? (
                        onVerified ? (
                            <Button type="button" className="h-11" onClick={onVerified}>
                                {t('developerVerification.continue', '继续')}
                            </Button>
                        ) : (
                            <Button type="button" className="h-11" onClick={() => onOpenChange(false)}>
                                {t('developerVerification.close', '关闭')}
                            </Button>
                        )
                    ) : editable ? (
                        <>
                            <Button type="button" variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
                                {t('developerVerification.cancel', '取消')}
                            </Button>
                            <Button type="button" className="h-11" disabled={submitting || uploading} onClick={() => void handleSubmit()}>
                                {submitting && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                                {submitting
                                    ? t('developerVerification.form.submitting', '提交中…')
                                    : status === 'REJECTED' || status === 'SUSPENDED'
                                      ? t('developerVerification.form.resubmit', '重新提交')
                                      : t('developerVerification.form.submit', '提交认证')}
                            </Button>
                        </>
                    ) : (
                        <Button type="button" variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
                            {t('developerVerification.close', '关闭')}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
