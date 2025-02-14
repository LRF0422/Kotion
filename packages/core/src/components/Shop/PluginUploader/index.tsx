import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, FileUploader, Form, FormControl, FormField, FormItem, FormLabel, Input, Step, Stepper, Tabs, TabsContent, TabsList, TabsTrigger, Tag, TagInput, Textarea, useForm, zodResolver } from "@repo/ui";
import React, { PropsWithChildren } from "react";
import { z } from "@repo/ui";
import { Plus } from "@repo/icon";
import { EditorRender } from "@repo/editor";

interface Description {
    label: string,
    content: string
}

export const PluginUploader: React.FC<PropsWithChildren> = ({ children }) => {

    const steps: Step[] = [
        { number: 1, label: "填写基本信息" },
        { number: 2, label: "上传图标" },
        { number: 3, label: "填写描述信息" },
        { number: 4, label: "上传插件" },
        { number: 5, label: "提交审核" }
    ];

    const [currentStep, setCurrentStep] = React.useState(1);
    const [activeTagIndex, setActiveTagIndex] = React.useState<number | null>(null);
    const [descriptions, setDescriptions] = React.useState<Description[]>([
        { label: "Feature", content: "插件名称" },
        { label: "Detail", content: "插件名称" },
        { label: "ChangeLog", content: "插件名称" },
    ])

    const formSchema = z.object({
        name: z.string().min(2).max(50),
        key: z.string().min(2).max(50),
        version: z.string(),
        tags: z.array(z.object({
            id: z.string(),
            text: z.string()
        })),
        description: z.string().min(2).max(50),
        descriptions: z.array(z.object({
            label: z.string(),
            content: z.string()
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
                            name="key"
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
                        <Button size="icon" className=" ml-1"><Plus className="h-4 w-4" /></Button>
                    </TabsList>
                    <div className="h-[200px]">
                        {descriptions.map((item, index) => (
                            <TabsContent key={index} value={item.label} className=" border rounded-sm h-full overflow-auto">
                                <EditorRender
                                    id=""
                                    isEditable
                                    withTitle={false}
                                    toc={false}
                                    toolbar={false}
                                    className="w-full h-full prose-sm"
                                />
                            </TabsContent>
                        ))
                        }
                    </div>
                </Tabs>
            </div>
            case 4: return <div>
                <FileUploader />
            </div>
            case 5: return <div className=" flex justify-center w-full h-full">
                <Button>提交审核</Button>
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