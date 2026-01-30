import {
    Button, Dialog, DialogContent, DialogDescription,
    DialogHeader, DialogTitle, DialogTrigger, FileUploader,
    Form, FormControl, FormField, FormItem, FormLabel, FormMessage, IconButton, Input,
    Step, Stepper, Tabs, TabsContent, TabsList, TabsTrigger, TagInput, Textarea, useForm, zodResolver, toast,
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Progress, ScrollArea, cn
} from "@kn/ui";
import React, { PropsWithChildren, useCallback, useMemo } from "react";
import { z } from "@kn/ui";
import { CheckCircle2, PlusIcon, TrashIcon, Loader2Icon, XIcon, UploadIcon, ImageIcon } from "@kn/icon";
import { CollaborationEditor, JSONContent } from "@kn/editor";
import { useTranslation } from "@kn/common";
import { useApi, useUploadFile } from "../../../hooks";
import { useSafeState } from "ahooks";
import { APIS } from "../../../api";

interface Description {
    label: string,
    content: JSONContent
}

export const PluginUploader: React.FC<PropsWithChildren> = ({ children }) => {
    const { t } = useTranslation();

    const steps: Step[] = useMemo(() => [
        { number: 1, label: t('pluginUploader.steps.basicInfo'), description: t('pluginUploader.steps.basicInfoDesc') },
        { number: 2, label: t('pluginUploader.steps.features'), description: t('pluginUploader.steps.featuresDesc') },
        { number: 3, label: t('pluginUploader.steps.upload'), description: t('pluginUploader.steps.uploadDesc') }
    ], [t]);

    const { upload, usePath, uploadFile } = useUploadFile()
    const [open, setOpen] = useSafeState(false);
    const [showExitDialog, setShowExitDialog] = useSafeState(false);
    const [currentStep, setCurrentStep] = React.useState(1);
    const [activeTagIndex, setActiveTagIndex] = React.useState<number | null>(null);
    const [resourcePath, setResourcePath] = useSafeState<string>("");
    const [uploadProgress, setUploadProgress] = useSafeState(0);
    const [isUploading, setIsUploading] = useSafeState(false);
    const [isSubmitting, setIsSubmitting] = useSafeState(false);
    const [iconPath, setIconPath] = useSafeState<string>("");
    const [iconUploading, setIconUploading] = useSafeState(false);
    const [attachments, setAttachments] = useSafeState<File[]>([]);
    const [descriptions, setDescriptions] = React.useState<Description[]>([
        { label: "Feature", content: {} },
        { label: "Detail", content: {} },
        { label: "ChangeLog", content: {} },
    ]);
    const [activeDescTab, setActiveDescTab] = React.useState("Feature");

    const formSchema = z.object({
        name: z.string()
            .min(2, t('pluginUploader.validation.nameMin'))
            .max(50, t('pluginUploader.validation.nameMax')),
        pluginKey: z.string()
            .min(2, t('pluginUploader.validation.keyMin'))
            .max(50, t('pluginUploader.validation.keyMax'))
            .regex(/^[a-z0-9-]+$/, t('pluginUploader.validation.keyFormat')),
        version: z.string()
            .regex(/^\d+\.\d+\.\d+$/, t('pluginUploader.validation.versionFormat')),
        tags: z.array(z.object({
            id: z.string(),
            text: z.string()
        })).min(1, t('pluginUploader.validation.tagsMin')),
        icon: z.string().optional(),
        resourcePath: z.string(),
        description: z.string()
            .min(10, t('pluginUploader.validation.descriptionMin'))
            .max(500, t('pluginUploader.validation.descriptionMax')),
        versionDescs: z.array(z.object({
            label: z.string(),
            content: z.string()
        }))
    })

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            pluginKey: "",
            version: "1.0.0",
            tags: [],
            icon: "",
            resourcePath: "",
            description: "",
            versionDescs: []
        },
    })

    const validateCurrentStep = async (): Promise<boolean> => {
        try {
            switch (currentStep) {
                case 1:
                    // Trigger validation for basic fields
                    const basicFields = await form.trigger(['name', 'pluginKey', 'version', 'tags', 'description']);
                    if (!basicFields) {
                        // Get the first error message to show in toast
                        const errors = form.formState.errors;
                        const firstError = errors.name?.message ||
                            errors.pluginKey?.message ||
                            errors.version?.message ||
                            errors.tags?.message ||
                            errors.description?.message;
                        toast.error(firstError || t('pluginUploader.validation.formIncomplete'));
                        return false;
                    }
                    return true;
                case 2:
                    // Description step - always valid (descriptions are optional)
                    return true;
                case 3:
                    if (!resourcePath) {
                        toast.error(t('pluginUploader.validation.fileRequired'));
                        return false;
                    }
                    return true;
                default:
                    return true;
            }
        } catch (error: any) {
            console.error('Validation error:', error);
            toast.error(t('pluginUploader.validation.validationError'));
            return false;
        }
    };

    const handleNext = async () => {
        if (currentStep < 3) {
            const isValid = await validateCurrentStep();
            if (isValid) {
                setCurrentStep((prev) => Math.min(prev + 1, 3));
            }
        }
    };

    const handlePrev = () => {
        if (currentStep > 1) {
            setCurrentStep((prev) => Math.max(prev - 1, 1));
        }
    };

    const handleStepClick = (stepNumber: number) => {
        // Only allow clicking on completed or current steps
        if (stepNumber <= currentStep) {
            setCurrentStep(stepNumber);
        }
    };

    const handleSubmit = async () => {
        const isValid = await validateCurrentStep();
        if (!isValid) return;

        setIsSubmitting(true);
        try {
            const value = form.getValues();
            value.versionDescs = descriptions.map(item => ({ label: item.label, content: JSON.stringify(item.content) }));
            value.resourcePath = resourcePath;
            value.icon = iconPath;

            await useApi(APIS.CREATE_PLUGIN, null, value);

            toast.success(t('pluginUploader.toast.submitSuccess'));

            // Reset form and close dialog
            resetForm();
            setOpen(false);
        } catch (error: any) {
            toast.error(error?.message || t('pluginUploader.toast.submitFailed'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetForm = () => {
        form.reset();
        setCurrentStep(1);
        setIconPath("");
        setAttachments([]);
        setResourcePath("");
        setUploadProgress(0);
        setDescriptions([
            { label: "Feature", content: {} },
            { label: "Detail", content: {} },
            { label: "ChangeLog", content: {} },
        ]);
        setActiveDescTab("Feature");
    };

    const handleDialogClose = (newOpen: boolean) => {
        if (!newOpen && (currentStep > 1 || form.formState.isDirty)) {
            setShowExitDialog(true);
        } else {
            setOpen(newOpen);
            if (!newOpen) {
                resetForm();
            }
        }
    };

    const confirmExit = () => {
        setShowExitDialog(false);
        setOpen(false);
        resetForm();
    };

    const handleIconUpload = useCallback(async () => {
        try {
            setIconUploading(true);
            const res = await upload(["image/*"]);
            setIconPath(res.name);
            toast.success(t('pluginUploader.toast.iconUploaded'));
        } catch (error: any) {
            toast.error(error?.message || t('pluginUploader.toast.iconUploadFailed'));
        } finally {
            setIconUploading(false);
        }
    }, [upload]);

    const handleRemoveIcon = useCallback(() => {
        setIconPath("");
        toast.info(t('pluginUploader.toast.iconRemoved'));
    }, []);

    const handleAddDescriptionTab = () => {
        const newLabel = `Custom${descriptions.length + 1}`;
        setDescriptions([...descriptions, { label: newLabel, content: {} }]);
        setActiveDescTab(newLabel);
    };

    const handleRemoveDescriptionTab = (index: number) => {
        if (descriptions.length <= 1) {
            toast.warning(t('pluginUploader.validation.keepOneTab'));
            return;
        }

        const newDescriptions = descriptions.filter((_, i) => i !== index);
        setDescriptions(newDescriptions);
        if (activeDescTab === descriptions[index].label) {
            setActiveDescTab(newDescriptions[0].label);
        }
    };

    // Step 1: Basic Info
    const renderBasicInfo = () => (
        <Form {...form}>
            <form className="space-y-5">
                {/* 基础标识信息 */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                        {t('pluginUploader.sections.basicIdentity')}
                    </div>
                    <div className="grid grid-cols-2 gap-4 pl-3">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('pluginUploader.fields.pluginName')} <span className="text-destructive">*</span></FormLabel>
                                    <FormControl>
                                        <Input placeholder={t('pluginUploader.fields.pluginNamePlaceholder')} {...field} />
                                    </FormControl>
                                    <p className="text-xs text-muted-foreground">{t('pluginUploader.fields.pluginNameHint')}</p>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="pluginKey"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('pluginUploader.fields.pluginKey')} <span className="text-destructive">*</span></FormLabel>
                                    <FormControl>
                                        <Input placeholder={t('pluginUploader.fields.pluginKeyPlaceholder')} {...field} />
                                    </FormControl>
                                    <p className="text-xs text-muted-foreground">{t('pluginUploader.fields.pluginKeyHint')}</p>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                </div>

                {/* 版本与分类 */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                        {t('pluginUploader.sections.versionAndCategory')}
                    </div>
                    <div className="grid grid-cols-2 gap-4 pl-3">
                        <FormField
                            control={form.control}
                            name="version"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('pluginUploader.fields.version')} <span className="text-destructive">*</span></FormLabel>
                                    <FormControl>
                                        <Input placeholder={t('pluginUploader.fields.versionPlaceholder')} {...field} />
                                    </FormControl>
                                    <p className="text-xs text-muted-foreground">{t('pluginUploader.fields.versionHint')}</p>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="tags"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('pluginUploader.fields.tags')} <span className="text-destructive">*</span></FormLabel>
                                    <FormControl>
                                        <TagInput
                                            tags={field.value}
                                            setTags={(tags) => field.onChange(tags)}
                                            activeTagIndex={activeTagIndex}
                                            setActiveTagIndex={setActiveTagIndex}
                                            placeholder={t('pluginUploader.fields.tagsPlaceholder')}
                                        />
                                    </FormControl>
                                    <p className="text-xs text-muted-foreground">{t('pluginUploader.fields.tagsHint')}</p>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                </div>

                {/* 展示信息 */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                        {t('pluginUploader.sections.displayInfo')}
                    </div>
                    <div className="flex gap-4 pl-3">
                        {/* Icon Upload */}
                        <div className="space-y-2">
                            <FormLabel>{t('pluginUploader.fields.icon')}</FormLabel>
                            <div
                                className={cn(
                                    "relative w-20 h-20 flex items-center justify-center border-2 rounded-lg overflow-hidden transition-all",
                                    iconPath ? "border-green-500 bg-green-50/50 dark:bg-green-950/30" : "border-dashed border-muted-foreground/50 bg-muted/30 hover:border-primary hover:bg-muted/50",
                                    iconUploading ? "cursor-wait" : "cursor-pointer"
                                )}
                                onClick={() => {
                                    if (!iconUploading && !iconPath) {
                                        handleIconUpload();
                                    }
                                }}
                            >
                                {iconUploading ? (
                                    <Loader2Icon className="h-6 w-6 animate-spin text-primary" />
                                ) : iconPath ? (
                                    <>
                                        <img
                                            src={usePath(iconPath)}
                                            alt="Plugin Icon"
                                            className="w-full h-full object-cover"
                                        />
                                        <div className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <IconButton
                                                icon={<TrashIcon className="h-4 w-4 text-white" />}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleRemoveIcon();
                                                }}
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center gap-1 text-muted-foreground">
                                        <ImageIcon className="h-6 w-6" />
                                        <span className="text-xs">{t('pluginUploader.fields.iconUpload')}</span>
                                    </div>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground">{t('pluginUploader.fields.iconHint')}</p>
                        </div>
                        {/* Description */}
                        <div className="flex-1">
                            <FormField
                                control={form.control}
                                name="description"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('pluginUploader.fields.description')} <span className="text-destructive">*</span></FormLabel>
                                        <FormControl>
                                            <Textarea
                                                placeholder={t('pluginUploader.fields.descriptionPlaceholder')}
                                                rows={4}
                                                className="resize-none"
                                                {...field}
                                            />
                                        </FormControl>
                                        <div className="flex justify-between items-center">
                                            <p className="text-xs text-muted-foreground">{t('pluginUploader.fields.descriptionHint')}</p>
                                            <span className={cn(
                                                "text-xs",
                                                (field.value?.length || 0) > 400 ? "text-orange-500" : "text-muted-foreground"
                                            )}>
                                                {field.value?.length || 0}/500
                                            </span>
                                        </div>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>
                    </div>
                </div>
            </form>
        </Form>
    );

    // Tab label mapping for display
    const tabLabelMap: Record<string, { name: string; hint: string }> = useMemo(() => ({
        "Feature": { name: t('pluginUploader.tabs.feature'), hint: t('pluginUploader.tabs.featureHint') },
        "Detail": { name: t('pluginUploader.tabs.detail'), hint: t('pluginUploader.tabs.detailHint') },
        "ChangeLog": { name: t('pluginUploader.tabs.changelog'), hint: t('pluginUploader.tabs.changelogHint') }
    }), [t]);

    const getTabDisplay = (label: string) => tabLabelMap[label] || { name: label, hint: t('pluginUploader.tabs.customHint') };

    // Step 2: Version Description
    const renderDescription = () => (
        <div className="space-y-4">
            {/* Header Section */}
            <div className="p-4 bg-muted/30 rounded-lg border border-dashed">
                <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm">💡</span>
                    </div>
                    <div>
                        <p className="text-sm font-medium">{t('pluginUploader.docTip.title')}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            {t('pluginUploader.docTip.content')}
                        </p>
                    </div>
                </div>
            </div>

            <Tabs value={activeDescTab} onValueChange={setActiveDescTab}>
                <div className="flex items-center justify-between mb-3">
                    <TabsList className="h-9">
                        {descriptions.map((item, index) => (
                            <TabsTrigger key={index} value={item.label} className="text-sm px-3 gap-1">
                                {getTabDisplay(item.label).name}
                                {descriptions.length > 1 && index >= 3 && (
                                    <XIcon
                                        className="h-3 w-3 ml-1 hover:text-destructive cursor-pointer"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveDescriptionTab(index);
                                        }}
                                    />
                                )}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                    <IconButton
                        icon={<PlusIcon className="h-4 w-4" />}
                        onClick={handleAddDescriptionTab}
                    />
                </div>

                {/* Tab hint */}
                <p className="text-xs text-muted-foreground mb-2 pl-1">
                    {getTabDisplay(activeDescTab).hint}
                </p>

                <div className="border rounded-lg overflow-hidden">
                    {descriptions.map((item: any, index) => (
                        <TabsContent key={index} value={item.label} className="m-0">
                            <CollaborationEditor
                                id=""
                                content={item.content}
                                isEditable
                                synced={true}
                                width="w-full"
                                withTitle={false}
                                toc={false}
                                toolbar={true}
                                user={null}
                                token=""
                                className="min-h-[280px] max-h-[400px] prose-sm"
                                onBlur={(editor) => {
                                    const content = editor.getJSON();
                                    setDescriptions((data) => data.map((it, i) => i === index ? { ...it, content } : it))
                                }}
                            />
                        </TabsContent>
                    ))}
                </div>
            </Tabs>
        </div>
    );

    // Step 3: Upload & Submit
    const renderUploadSubmit = () => (
        <div className="space-y-6">
            {/* File Upload Section */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <UploadIcon className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">{t('pluginUploader.uploadSection.title')}</span>
                        <span className="text-destructive">*</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{t('pluginUploader.uploadSection.hint')}</span>
                </div>

                <FileUploader
                    value={attachments}
                    className="w-full"
                    accept={{
                        "text/javascript": [".js"]
                    }}
                    maxSize={1024 * 1024 * 100}
                    onValueChange={(files) => setAttachments(files)}
                    onUpload={async (file) => {
                        setIsUploading(true);
                        setUploadProgress(0);
                        try {
                            const interval = setInterval(() => {
                                setUploadProgress(prev => Math.min(prev + 10, 90));
                            }, 200);

                            const res = await uploadFile(file[0]);
                            clearInterval(interval);
                            setUploadProgress(100);
                            setResourcePath(res.name);

                            toast.success(t('pluginUploader.toast.fileUploaded', { filename: res.originalName }));
                        } catch (error: any) {
                            toast.error(error?.message || t('pluginUploader.toast.fileUploadFailed'));
                        } finally {
                            setIsUploading(false);
                        }
                    }}
                    disabled={isUploading}
                />

                {isUploading && (
                    <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                        <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{t('pluginUploader.uploadSection.uploading')}</span>
                            <span>{uploadProgress}%</span>
                        </div>
                        <Progress value={uploadProgress} className="w-full h-2" />
                    </div>
                )}

                {resourcePath && (
                    <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-900">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <span className="text-sm text-green-700 dark:text-green-400">{t('pluginUploader.uploadSection.uploaded')}</span>
                    </div>
                )}
            </div>

            {/* Summary Card */}
            <div className="rounded-lg border bg-gradient-to-br from-muted/50 to-muted/30 p-4 space-y-4">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{t('pluginUploader.preview.title')}</span>
                    <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">{t('pluginUploader.preview.aboutToPublish')}</span>
                </div>

                <div className="flex gap-4">
                    {/* Icon Preview */}
                    {iconPath && (
                        <div className="w-14 h-14 rounded-lg overflow-hidden border bg-background flex-shrink-0">
                            <img
                                src={usePath(iconPath)}
                                alt="Plugin Icon"
                                className="w-full h-full object-cover"
                            />
                        </div>
                    )}

                    <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                            <span className="font-medium">{form.watch('name') || t('pluginUploader.preview.noName')}</span>
                            <span className="text-xs px-1.5 py-0.5 bg-muted rounded">v{form.watch('version') || '1.0.0'}</span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                            {form.watch('description') || t('pluginUploader.preview.noDescription')}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm pt-3 border-t">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-16">{t('pluginUploader.preview.pluginKey')}</span>
                        <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono">
                            {form.watch('pluginKey') || '-'}
                        </code>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-16">{t('pluginUploader.preview.fileStatus')}</span>
                        <span className={cn(
                            "text-xs font-medium flex items-center gap-1",
                            resourcePath ? "text-green-600" : "text-orange-500"
                        )}>
                            {resourcePath ? (
                                <><CheckCircle2 className="h-3 w-3" /> {t('pluginUploader.preview.uploaded')}</>
                            ) : (
                                <><UploadIcon className="h-3 w-3" /> {t('pluginUploader.preview.pending')}</>
                            )}
                        </span>
                    </div>
                    <div className="flex items-center gap-2 col-span-2">
                        <span className="text-xs text-muted-foreground w-16">{t('pluginUploader.preview.tags')}</span>
                        <div className="flex gap-1 flex-wrap">
                            {form.watch('tags')?.length > 0 ? (
                                form.watch('tags').map((tag: any, index: number) => (
                                    <span key={index} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                                        {tag.text}
                                    </span>
                                ))
                            ) : (
                                <span className="text-xs text-muted-foreground">{t('pluginUploader.preview.noTags')}</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Submission Tips */}
            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900">
                <p className="text-xs text-blue-700 dark:text-blue-400">
                    📋 <strong>{t('pluginUploader.submitTip.content')}</strong>
                </p>
            </div>
        </div>
    );

    const render = () => {
        switch (currentStep) {
            case 1:
                return renderBasicInfo();
            case 2:
                return renderDescription();
            case 3:
                return renderUploadSubmit();
            default:
                return renderBasicInfo();
        }
    }

    return (
        <>
            <Dialog open={open} onOpenChange={handleDialogClose}>
                <DialogTrigger asChild onClick={() => setOpen(true)}>
                    {children}
                </DialogTrigger>
                <DialogContent className="max-w-2xl w-full max-h-[90vh] flex flex-col p-0">
                    <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
                        <DialogTitle className="text-lg flex items-center gap-2">
                            <span>{t('pluginUploader.dialogTitle')}</span>
                            <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                {t('pluginUploader.step')} {currentStep}/{steps.length}
                            </span>
                        </DialogTitle>
                        <DialogDescription className="flex items-center gap-1">
                            <span className="font-medium text-foreground">{steps[currentStep - 1].label}</span>
                            <span>-</span>
                            <span>{(steps[currentStep - 1] as any).description || ''}</span>
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-hidden flex flex-col">
                        {/* Stepper */}
                        <div className="px-6 py-4 border-b bg-muted/30 flex-shrink-0">
                            <Stepper
                                steps={steps}
                                currentStep={currentStep}
                                onStepClick={handleStepClick}
                            />
                        </div>

                        {/* Content */}
                        <ScrollArea className="flex-1">
                            <div className="px-6 py-5">
                                {render()}
                            </div>
                        </ScrollArea>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t bg-background flex-shrink-0 flex items-center justify-between">
                            <Button
                                variant="ghost"
                                onClick={handlePrev}
                                disabled={currentStep === 1}
                                className="gap-1"
                            >
                                {t('pluginUploader.buttons.prev')}
                            </Button>
                            <div className="flex items-center gap-2">
                                {currentStep < 3 ? (
                                    <Button onClick={handleNext}>
                                        {t('pluginUploader.buttons.next')}
                                    </Button>
                                ) : (
                                    <Button
                                        onClick={handleSubmit}
                                        disabled={isSubmitting || !resourcePath}
                                        className="min-w-[100px]"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />
                                                {t('pluginUploader.buttons.submitting')}
                                            </>
                                        ) : (
                                            t('pluginUploader.buttons.submit')
                                        )}
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('pluginUploader.exitDialog.title')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('pluginUploader.exitDialog.description')}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setShowExitDialog(false)}>
                            {t('pluginUploader.exitDialog.cancel')}
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={confirmExit}>
                            {t('pluginUploader.exitDialog.confirm')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}