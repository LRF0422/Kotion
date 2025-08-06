import {
    Button, Dialog, DialogContent, DialogDescription,
    DialogHeader, DialogTitle, DialogTrigger, FileUploader,
    Form, FormControl, FormField, FormItem, FormLabel, IconButton, Input,
    Step, Stepper, Tabs, TabsContent, TabsList, TabsTrigger, TagInput, Textarea, useForm, zodResolver
} from "@kn/ui";
import React, { PropsWithChildren } from "react";
import { z } from "@kn/ui";
import { CheckCircle2, PlusIcon } from "@kn/icon";
import { EditorRender, JSONContent } from "@kn/editor";
import { useApi, useUploadFile } from "../../../hooks";
import { useSafeState } from "ahooks";
import { APIS } from "../../../api";

interface Description {
    label: string,
    content: JSONContent
}

export const PluginUploader: React.FC<PropsWithChildren> = ({ children }) => {

    const steps: Step[] = [
        { number: 1, label: "填写基本信息" },
        { number: 2, label: "上传图标" },
        { number: 3, label: "填写描述信息" },
        { number: 4, label: "上传插件" },
        { number: 5, label: "提交审核" }
    ];

    const logoSize = [
        {
            label: '64X64',
            size: [64, 64],
            src: ""
        },
        {
            label: '100X100',
            size: [100, 100],
            src: ""
        },
        {
            label: '120X120',
            size: [120, 120],
            src: ""
        },
        {
            label: '150X150',
            size: [150, 150],
            src: ""
        }
    ]

    const { upload, usePath, uploadFile } = useUploadFile()
    const [currentStep, setCurrentStep] = React.useState(1);
    const [activeTagIndex, setActiveTagIndex] = React.useState<number | null>(null);
    const [resourcePath, setResourcePath] = useSafeState<string>("")
    const [logos, setLogos] = useSafeState(logoSize)
    const [attachments, setAttachments] = useSafeState<File[]>([])
    const [descriptions, setDescriptions] = React.useState<Description[]>([
        { label: "Feature", content: {} },
        { label: "Detail", content: {} },
        { label: "ChangeLog", content: {} },
    ])

    const formSchema = z.object({
        name: z.string().min(2).max(50),
        pluginKey: z.string().min(2).max(50),
        version: z.string(),
        tags: z.array(z.object({
            id: z.string(),
            text: z.string()
        })),
        logos: z.array(z.object({
            size: z.array(z.number()),
            label: z.string(),
            src: z.string()
        })),
        resourcePath: z.string(),
        description: z.string().min(2).max(50),
        descriptions: z.array(z.object({
            label: z.string(),
            content: z.object({})
        }))
    })

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            tags: []
        },
    })

    const handleNext = () => {
        if (currentStep < 9) {
            setCurrentStep((prev) => Math.min(prev + 1, 9));
        }
    };

    const handlePrev = () => {
        if (currentStep > 1) {
            setCurrentStep((prev) => Math.max(prev - 1, 1));
        }
    };

    const handleStepClick = (stepNumber: number) => {
        setCurrentStep(stepNumber);
    };

    const handleUpload = () => {
        const value = form.getValues()
        value.descriptions = descriptions
        value.resourcePath = resourcePath
        value.logos = logos
        useApi(APIS.CREATE_PLUGIN, null, value).then(res => {
            console.log("res", res);

        })
    }

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
                                    <FormLabel>插件名称</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="pluginKey"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>插件Key</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="version"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>插件版本</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="tags"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>标签</FormLabel>
                                    <FormControl>
                                        <TagInput tags={field.value} setTags={(tags) => {
                                            field.onChange(tags)
                                        }} activeTagIndex={activeTagIndex} setActiveTagIndex={setActiveTagIndex} />
                                    </FormControl>
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
                                    <FormLabel>插件描述</FormLabel>
                                    <FormControl>
                                        <Textarea {...field} />
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                    </div>
                </form>
            </Form>
            case 3: return <div>
                <Tabs defaultValue={descriptions[0].label}>
                    <TabsList>
                        {descriptions.map((item, index) => (
                            <TabsTrigger key={index} value={item.label}>{item.label}</TabsTrigger>
                        ))}
                        <IconButton icon={<PlusIcon className="h-4 w-4" />} className="ml-1" />
                    </TabsList>
                    <div className="h-[200px]">
                        {descriptions.map((item, index) => (
                            <TabsContent key={index} value={item.label} className=" border rounded-sm h-full overflow-auto">
                                <EditorRender
                                    id=""
                                    content={item.content}
                                    isEditable
                                    withTitle={false}
                                    toc={false}
                                    toolbar={false}
                                    className="w-full h-full prose-sm"
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
            case 4: return <div className="flex justify-center">
                <FileUploader value={attachments} className=" w-[100%]"
                    accept={{
                        "*": []
                    }}
                    onValueChange={(files) => setAttachments(files)}
                    onUpload={(file) => {
                        return uploadFile(file[0]).then((res) => {
                            setResourcePath(res.name)
                        })
                    }} />
            </div>
            case 5: return <div className="flex flex-col items-center w-full h-full gap-2">
                <CheckCircle2 className="h-[200px]  w-[200px] text-green-500" />
                <div className=" space-x-2 mt-4">
                    <Button onClick={handlePrev}>上一步</Button>
                    <Button onClick={handleUpload}>提交审核</Button>
                </div>
            </div>
            case 2: return <div className="flex gap-3 w-full h-[200px] justify-center">
                {
                    logos.map((it, index) => (
                        it.src ? <img src={usePath(it.src)} width={it.size[0] + 'px'} height={it.size[1] + 'px'} /> :
                            <div className=" space-y-1" key={index}>
                                <div
                                    style={{
                                        width: it.size[0],
                                        height: it.size[1]
                                    }}
                                    className={`flex items-center justify-center border rounded-sm bg-muted cursor-pointer`}
                                    onClick={() => {
                                        upload().then(res => {
                                            setLogos(logos.map((item, i) => i === index ? { ...item, src: res.name } : item))
                                        })
                                    }}
                                >
                                    {it.label}
                                </div>
                            </div>
                    ))
                }
            </div>
            default: return <div>
                <FileUploader />
            </div>
        }
    }

    return <Dialog>
        <DialogTrigger asChild>{children}</DialogTrigger>
        <DialogContent className="w-[600px] max-w-none h-auto ">
            <DialogHeader>
                <DialogTitle>发布插件</DialogTitle>
                <DialogDescription />
            </DialogHeader>
            <div className="min-h-[400px] space-y-2">
                <Stepper
                    steps={steps}
                    currentStep={currentStep}
                    onStepClick={handleStepClick}
                />
                {render()}
                {currentStep !== 5 && <div className="text-center space-x-1">
                    <Button onClick={handlePrev}>上一步</Button>
                    <Button onClick={handleNext}>下一步</Button>
                </div>}
            </div>
        </DialogContent>
    </Dialog>
}