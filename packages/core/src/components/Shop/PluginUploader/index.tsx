import {
    Button, Dialog, DialogContent, DialogDescription,
    DialogHeader, DialogTitle, DialogTrigger, FileUploader,
    Form, FormControl, FormField, FormItem, FormLabel, FormMessage, IconButton, Input,
    Step, Stepper, Tabs, TabsContent, TabsList, TabsTrigger, TagInput, Textarea, useForm, zodResolver, useToast,
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, Progress
} from "@kn/ui";
import React, { PropsWithChildren, useCallback } from "react";
import { z } from "@kn/ui";
import { CheckCircle2, PlusIcon, TrashIcon, Loader2Icon, XIcon } from "@kn/icon";
import { CollaborationEditor, JSONContent } from "@kn/editor";
import { useApi, useUploadFile } from "../../../hooks";
import { useSafeState } from "ahooks";
import { APIS } from "../../../api";

interface Description {
    label: string,
    content: JSONContent
}

interface LogoItem {
    label: string;
    size: number;
    path: string;
    uploading?: boolean;
}

export const PluginUploader: React.FC<PropsWithChildren> = ({ children }) => {
    const { toast } = useToast();

    const steps: Step[] = [
        { number: 1, label: "填写基本信息" },
        { number: 2, label: "上传图标" },
        { number: 3, label: "填写描述信息" },
        { number: 4, label: "上传插件" },
        { number: 5, label: "提交审核" }
    ];

    const logoSize: LogoItem[] = [
        {
            label: '64X64',
            size: 64,
            path: "",
            uploading: false
        },
        {
            label: '100X100',
            size: 100,
            path: "",
            uploading: false
        },
        {
            label: '120X120',
            size: 120,
            path: "",
            uploading: false
        },
        {
            label: '150X150',
            size: 150,
            path: "",
            uploading: false
        }
    ]

    const { upload, usePath, uploadFile } = useUploadFile()
    const [open, setOpen] = useSafeState(false);
    const [showExitDialog, setShowExitDialog] = useSafeState(false);
    const [currentStep, setCurrentStep] = React.useState(1);
    const [activeTagIndex, setActiveTagIndex] = React.useState<number | null>(null);
    const [resourcePath, setResourcePath] = useSafeState<string>("");
    const [uploadProgress, setUploadProgress] = useSafeState(0);
    const [isUploading, setIsUploading] = useSafeState(false);
    const [isSubmitting, setIsSubmitting] = useSafeState(false);
    const [logos, setLogos] = useSafeState<LogoItem[]>(logoSize);
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
        logos: z.array(z.object({
            size: z.number(),
            label: z.string(),
            path: z.string()
        })),
        resourcePath: z.string().min(1, "请上传插件文件"),
        description: z.string().min(10, "插件描述至少10个字符").max(200, "插件描述最多200个字符"),
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
            logos: [],
            resourcePath: "",
            description: "",
            versionDescs: []
        },
    })

    const validateCurrentStep = async (): Promise<boolean> => {
        let isValid = true;

        switch (currentStep) {
            case 1:
                const basicFields = await form.trigger(['name', 'pluginKey', 'version', 'tags', 'description']);
                isValid = basicFields;
                if (!isValid) {
                    toast({
                        title: "验证失败",
                        description: "请检查并填写所有必填字段",
                        variant: "destructive"
                    });
                }
                break;
            case 2:
                const hasAllLogos = logos.every(logo => logo.path !== "");
                if (!hasAllLogos) {
                    toast({
                        title: "请上传所有尺寸的图标",
                        description: "需要上传所有4个尺寸的图标才能继续",
                        variant: "destructive"
                    });
                    isValid = false;
                }
                break;
            case 4:
                if (!resourcePath) {
                    toast({
                        title: "请上传插件文件",
                        description: "需要上传插件文件才能继续",
                        variant: "destructive"
                    });
                    isValid = false;
                }
                break;
        }

        return isValid;
    };

    const handleNext = async () => {
        if (currentStep < 5) {
            const isValid = await validateCurrentStep();
            if (isValid) {
                setCurrentStep((prev) => Math.min(prev + 1, 5));
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

    const handleUpload = async () => {
        setIsSubmitting(true);
        try {
            const value = form.getValues();
            value.versionDescs = descriptions.map(item => ({ label: item.label, content: JSON.stringify(item.content) }));
            value.resourcePath = resourcePath;
            value.logos = logos.map(({ label, size, path }) => ({ label, size, path }));

            await useApi(APIS.CREATE_PLUGIN, null, value);

            toast({
                title: "提交成功",
                description: "插件已成功提交审核，请等待审核结果",
            });

            // Reset form and close dialog
            resetForm();
            setOpen(false);
        } catch (error: any) {
            toast({
                title: "提交失败",
                description: error?.message || "提交插件时发生错误，请重试",
                variant: "destructive"
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetForm = () => {
        form.reset();
        setCurrentStep(1);
        setLogos(logoSize);
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
        if (!newOpen && currentStep > 1) {
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

    const handleLogoUpload = useCallback(async (index: number) => {
        try {
            setLogos(prev => prev.map((item, i) =>
                i === index ? { ...item, uploading: true } : item
            ));

            const res = await upload(["image/*"]);

            setLogos(prev => prev.map((item, i) =>
                i === index ? { ...item, path: res.name, uploading: false } : item
            ));

            toast({
                title: "上传成功",
                description: `图标 ${logos[index].label} 上传成功`,
            });
        } catch (error: any) {
            setLogos(prev => prev.map((item, i) =>
                i === index ? { ...item, uploading: false } : item
            ));

            toast({
                title: "上传失败",
                description: error?.message || "上传图标失败，请重试",
                variant: "destructive"
            });
        }
    }, [logos, upload, toast]);

    const handleRemoveLogo = useCallback((index: number) => {
        setLogos(prev => prev.map((item, i) =>
            i === index ? { ...item, path: "" } : item
        ));
        toast({
            title: "已删除",
            description: `图标 ${logos[index].label} 已删除`,
        });
    }, [logos, toast]);

    const handleAddDescriptionTab = () => {
        const newLabel = `Custom${descriptions.length + 1}`;
        setDescriptions([...descriptions, { label: newLabel, content: {} }]);
        setActiveDescTab(newLabel);
    };

    const handleRemoveDescriptionTab = (index: number) => {
        if (descriptions.length <= 1) {
            toast({
                title: "无法删除",
                description: "至少需要保留一个描述标签",
                variant: "destructive"
            });
            return;
        }

        const newDescriptions = descriptions.filter((_, i) => i !== index);
        setDescriptions(newDescriptions);
        if (activeDescTab === descriptions[index].label) {
            setActiveDescTab(newDescriptions[0].label);
        }
    };

    const render = () => {
        switch (currentStep) {
            case 1: return <Form {...form}>
                <form className=" space-y-1">
                    <div className=" grid grid-cols-2 gap-2">
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
                        <FormField
                            control={form.control}
                            name="version"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>插件版本 <span className="text-destructive">*</span></FormLabel>
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
                                        <TagInput tags={field.value} setTags={(tags) => {
                                            field.onChange(tags)
                                        }} activeTagIndex={activeTagIndex} setActiveTagIndex={setActiveTagIndex} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                    <div>
                        <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>插件描述 <span className="text-destructive">*</span></FormLabel>
                                    <FormControl>
                                        <Textarea placeholder="简要描述插件的功能和特点" rows={4} {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                </form>
            </Form>
            case 3: return <div>
                <Tabs value={activeDescTab} onValueChange={setActiveDescTab}>
                    <div className="flex justify-between items-center mb-2">
                        <TabsList>
                            {descriptions.map((item, index) => (
                                <TabsTrigger key={index} value={item.label}>
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
                            className="ml-1"
                            onClick={handleAddDescriptionTab}
                        />
                    </div>
                    <div className="h-full">
                        {descriptions.map((item: any, index) => (
                            <TabsContent key={index} value={item.label} className=" border w-full rounded-sm h-full overflow-auto">
                                <CollaborationEditor
                                    id=""
                                    content={item.content}
                                    isEditable
                                    width="w-[550px]"
                                    withTitle={false}
                                    toc={false}
                                    toolbar={true}
                                    user={null}
                                    token=""
                                    className="h-[250px] prose-sm"
                                    onBlur={(editor) => {
                                        const content = editor.getJSON();
                                        setDescriptions((data) => data.map((it, i) => i === index ? { ...it, content } : it))
                                    }}
                                />
                            </TabsContent>
                        ))
                        }
                    </div>
                </Tabs>
            </div>
            case 4: return <div className="flex flex-col items-center gap-4">
                <div className="text-sm text-muted-foreground">
                    支持上传 .js 文件，最大 100MB
                </div>
                <FileUploader
                    value={attachments}
                    className="w-[100%]"
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

                            toast({
                                title: "上传成功",
                                description: `插件文件已成功上传：${res.originalName}`,
                            });
                        } catch (error: any) {
                            toast({
                                title: "上传失败",
                                description: error?.message || "上传插件文件失败，请重试",
                                variant: "destructive"
                            });
                        } finally {
                            setIsUploading(false);
                        }
                    }}
                    disabled={isUploading}
                />
                {isUploading && (
                    <div className="w-full space-y-2">
                        <Progress value={uploadProgress} className="w-full" />
                        <p className="text-sm text-center text-muted-foreground">
                            上传中... {uploadProgress}%
                        </p>
                    </div>
                )}
                {resourcePath && (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                        <CheckCircle2 className="h-4 w-4" />
                        插件文件已上传
                    </div>
                )}
            </div>
            case 5: return <div className="flex flex-col items-center w-full h-full gap-2">
                <CheckCircle2 className="h-[200px] w-[200px] text-green-500" />
                <h3 className="text-lg font-semibold">准备就绪</h3>
                <p className="text-sm text-muted-foreground text-center max-w-md">
                    您已完成所有步骤，请确认信息无误后提交审核。审核通过后，您的插件将会发布到插件市场。
                </p>
                <div className="space-x-2 mt-4">
                    <Button onClick={handlePrev} variant="outline" disabled={isSubmitting}>
                        上一步
                    </Button>
                    <Button onClick={handleUpload} disabled={isSubmitting}>
                        {isSubmitting ? (
                            <>
                                <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />
                                提交中...
                            </>
                        ) : (
                            "提交审核"
                        )}
                    </Button>
                </div>
            </div>
            case 2: return <div>
                <div className="text-sm text-muted-foreground mb-4 text-center">
                    请上传不同尺寸的插件图标（支持 PNG、JPG、SVG 格式）
                </div>
                <div className="flex gap-3 w-full min-h-[200px] justify-center flex-wrap">
                    {logos.map((it, index) => (
                        <div className="space-y-2" key={index}>
                            <div
                                style={{
                                    width: it.size,
                                    height: it.size
                                }}
                                className={`relative flex items-center justify-center border-2 rounded-sm overflow-hidden ${it.path ? 'border-green-500' : 'border-dashed border-muted-foreground bg-muted'
                                    } ${it.uploading ? 'cursor-wait' : 'cursor-pointer hover:border-primary'}`}
                                onClick={() => {
                                    if (!it.uploading && !it.path) {
                                        handleLogoUpload(index);
                                    }
                                }}
                            >
                                {it.uploading ? (
                                    <Loader2Icon className="h-8 w-8 animate-spin text-primary" />
                                ) : it.path ? (
                                    <>
                                        <img
                                            src={usePath(it.path)}
                                            alt={it.label}
                                            className="w-full h-full object-cover"
                                        />
                                        <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <IconButton
                                                icon={<TrashIcon className="h-4 w-4" />}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleRemoveLogo(index);
                                                }}
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-xs text-center p-2">
                                        <PlusIcon className="h-6 w-6 mx-auto mb-1" />
                                        {it.label}
                                    </div>
                                )}
                            </div>
                            <div className="text-xs text-center text-muted-foreground">
                                {it.label}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            default: return <div>
                <FileUploader />
            </div>
        }
    }

    return (
        <>
            <Dialog open={open} onOpenChange={handleDialogClose}>
                <DialogTrigger asChild onClick={() => setOpen(true)}>
                    {children}
                </DialogTrigger>
                <DialogContent className="w-[600px] max-w-none h-auto">
                    <DialogHeader>
                        <DialogTitle>发布插件</DialogTitle>
                        <DialogDescription>
                            步骤 {currentStep} / {steps.length}: {steps[currentStep - 1].label}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="min-h-[400px] space-y-4">
                        <Stepper
                            steps={steps}
                            currentStep={currentStep}
                            onStepClick={handleStepClick}
                        />
                        {render()}
                        {currentStep !== 5 && (
                            <div className="text-center space-x-2 pt-4">
                                <Button
                                    onClick={handlePrev}
                                    variant="outline"
                                    disabled={currentStep === 1}
                                >
                                    上一步
                                </Button>
                                <Button onClick={handleNext}>
                                    {currentStep === 4 ? '完成' : '下一步'}
                                </Button>
                            </div>
                        )}
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