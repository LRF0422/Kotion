import {
    Button, Dialog, DialogContent, DialogDescription,
    DialogHeader, DialogTitle, DialogTrigger, FileUploader,
    Form, FormControl, FormField, FormItem, FormLabel, FormMessage, IconButton, Input,
    Step, Stepper, Tabs, TabsContent, TabsList, TabsTrigger, TagInput, Textarea, useForm, zodResolver, toast,
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Progress, ScrollArea, cn
} from "@kn/ui";
import React, { PropsWithChildren, useCallback } from "react";
import { z } from "@kn/ui";
import { CheckCircle2, PlusIcon, TrashIcon, Loader2Icon, XIcon, UploadIcon, ImageIcon } from "@kn/icon";
import { CollaborationEditor, JSONContent } from "@kn/editor";
import { useApi, useUploadFile } from "../../../hooks";
import { useSafeState } from "ahooks";
import { APIS } from "../../../api";

interface Description {
    label: string,
    content: JSONContent
}

export const PluginUploader: React.FC<PropsWithChildren> = ({ children }) => {
    const steps: Step[] = [
        { number: 1, label: "基本信息" },
        { number: 2, label: "详细描述" },
        { number: 3, label: "上传发布" }
    ];

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
        name: z.string().min(2, "插件名称至少2个字符").max(50, "插件名称最多50个字符"),
        pluginKey: z.string().min(2, "插件Key至少2个字符").max(50, "插件Key最多50个字符").regex(/^[a-z0-9-]+$/, "插件Key只能包含小写字母、数字和连字符"),
        version: z.string().regex(/^\d+\.\d+\.\d+$/, "版本号格式应为 x.y.z"),
        tags: z.array(z.object({
            id: z.string(),
            text: z.string()
        })).min(1, "至少添加一个标签"),
        icon: z.string().optional(),
        resourcePath: z.string(),
        description: z.string().min(10, "插件描述至少10个字符").max(500, "插件描述最多500个字符"),
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
                        toast.error(firstError || "请检查并填写所有必填字段");
                        return false;
                    }
                    return true;
                case 2:
                    // Description step - always valid (descriptions are optional)
                    return true;
                case 3:
                    if (!resourcePath) {
                        toast.error("请上传插件文件才能继续");
                        return false;
                    }
                    return true;
                default:
                    return true;
            }
        } catch (error: any) {
            console.error('Validation error:', error);
            toast.error("表单验证时发生错误，请检查输入");
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

            toast.success("插件已成功提交审核，请等待审核结果");

            // Reset form and close dialog
            resetForm();
            setOpen(false);
        } catch (error: any) {
            toast.error(error?.message || "提交插件时发生错误，请重试");
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
            toast.success("图标上传成功");
        } catch (error: any) {
            toast.error(error?.message || "上传图标失败，请重试");
        } finally {
            setIconUploading(false);
        }
    }, [upload]);

    const handleRemoveIcon = useCallback(() => {
        setIconPath("");
        toast.info("图标已删除");
    }, []);

    const handleAddDescriptionTab = () => {
        const newLabel = `Custom${descriptions.length + 1}`;
        setDescriptions([...descriptions, { label: newLabel, content: {} }]);
        setActiveDescTab(newLabel);
    };

    const handleRemoveDescriptionTab = (index: number) => {
        if (descriptions.length <= 1) {
            toast.error("至少需要保留一个描述标签");
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
            <form className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>插件名称 <span className="text-destructive">*</span></FormLabel>
                                <FormControl>
                                    <Input placeholder="输入插件名称" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="pluginKey"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>插件Key <span className="text-destructive">*</span></FormLabel>
                                <FormControl>
                                    <Input placeholder="例如: my-plugin" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <FormField
                        control={form.control}
                        name="version"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>版本号 <span className="text-destructive">*</span></FormLabel>
                                <FormControl>
                                    <Input placeholder="1.0.0" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="tags"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>标签 <span className="text-destructive">*</span></FormLabel>
                                <FormControl>
                                    <TagInput
                                        tags={field.value}
                                        setTags={(tags) => field.onChange(tags)}
                                        activeTagIndex={activeTagIndex}
                                        setActiveTagIndex={setActiveTagIndex}
                                        placeholder="添加标签后按回车"
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
                <div className="flex gap-4">
                    {/* Icon Upload */}
                    <div className="space-y-2">
                        <FormLabel>插件图标</FormLabel>
                        <div
                            className={cn(
                                "relative w-20 h-20 flex items-center justify-center border-2 rounded-lg overflow-hidden transition-all",
                                iconPath ? "border-green-500 bg-green-50/50" : "border-dashed border-muted-foreground/50 bg-muted/30 hover:border-primary hover:bg-muted/50",
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
                                    <span className="text-xs">上传</span>
                                </div>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">PNG/JPG, 建议 120x120</p>
                    </div>
                    {/* Description */}
                    <div className="flex-1">
                        <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>插件描述 <span className="text-destructive">*</span></FormLabel>
                                    <FormControl>
                                        <Textarea
                                            placeholder="简要描述插件的功能和特点..."
                                            rows={4}
                                            className="resize-none"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                </div>
            </form>
        </Form>
    );

    // Step 2: Version Description
    const renderDescription = () => (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                    添加详细的版本说明，帮助用户了解插件功能
                </p>
            </div>
            <Tabs value={activeDescTab} onValueChange={setActiveDescTab}>
                <div className="flex items-center gap-2 mb-3">
                    <TabsList className="h-9">
                        {descriptions.map((item, index) => (
                            <TabsTrigger key={index} value={item.label} className="text-sm px-3">
                                {item.label}
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
                <div className="border rounded-lg overflow-hidden">
                    {descriptions.map((item: any, index) => (
                        <TabsContent key={index} value={item.label} className="m-0">
                            <CollaborationEditor
                                id=""
                                content={item.content}
                                isEditable
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
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <UploadIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">上传插件文件</span>
                    <span className="text-xs text-muted-foreground">(支持 .js 文件，最大 100MB)</span>
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

                            toast.success(`插件文件已成功上传：${res.originalName}`);
                        } catch (error: any) {
                            toast.error(error?.message || "上传插件文件失败，请重试");
                        } finally {
                            setIsUploading(false);
                        }
                    }}
                    disabled={isUploading}
                />
                {isUploading && (
                    <div className="space-y-2">
                        <Progress value={uploadProgress} className="w-full h-2" />
                        <p className="text-xs text-center text-muted-foreground">
                            上传中... {uploadProgress}%
                        </p>
                    </div>
                )}
                {resourcePath && (
                    <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-900">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <span className="text-sm text-green-700 dark:text-green-400">插件文件已上传完成</span>
                    </div>
                )}
            </div>

            {/* Summary Card */}
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <h4 className="text-sm font-medium">发布预览</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">插件名称:</span>
                        <span className="font-medium truncate">{form.watch('name') || '-'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">版本:</span>
                        <span className="font-medium">{form.watch('version') || '-'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Key:</span>
                        <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{form.watch('pluginKey') || '-'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">文件:</span>
                        <span className={cn("font-medium", resourcePath ? "text-green-600" : "text-orange-500")}>
                            {resourcePath ? '已上传' : '未上传'}
                        </span>
                    </div>
                </div>
                {form.watch('description') && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                        {form.watch('description')}
                    </p>
                )}
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
                        <DialogTitle className="text-lg">发布插件</DialogTitle>
                        <DialogDescription>
                            {steps[currentStep - 1].label} ({currentStep}/{steps.length})
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
                                上一步
                            </Button>
                            <div className="flex items-center gap-2">
                                {currentStep < 3 ? (
                                    <Button onClick={handleNext}>
                                        下一步
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
                                                提交中...
                                            </>
                                        ) : (
                                            "提交审核"
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
                        <AlertDialogTitle>确认退出？</AlertDialogTitle>
                        <AlertDialogDescription>
                            您的进度尚未保存，退出后所有填写的信息将会丢失。确定要退出吗？
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setShowExitDialog(false)}>
                            取消
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={confirmExit}>
                            确认退出
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}