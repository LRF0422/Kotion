import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, FileUploader, Form, FormControl, FormField, FormItem, FormLabel, Input, Step, Stepper, Textarea, useForm, zodResolver } from "@repo/ui";
import React, { PropsWithChildren } from "react";
import { z } from "@repo/ui";


export const PluginUploader: React.FC<PropsWithChildren> = ({ children }) => {

    const steps: Step[] = [
        { number: 1, label: "填写基本信息" },
        { number: 2, label: "上传图标" },
        { number: 3, label: "填写描述信息" },
        { number: 4, label: "上传插件" },
        { number: 5, label: "提交审核" }
    ];

    const [currentStep, setCurrentStep] = React.useState(1);
    const formSchema = z.object({
        name: z.string().min(2).max(50),
        key: z.string().min(2).max(50),
        version: z.string(),
        tags: z.string(),
        description: z.string().min(2).max(50),
    })

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
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
                                    <FormLabel>Name</FormLabel>
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
                                    <FormLabel>Key</FormLabel>
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
                                    <FormLabel>Version</FormLabel>
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
                                    <FormLabel>Tags</FormLabel>
                                    <FormControl>
                                        <Input {...field} />
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
                                    <FormLabel>Description</FormLabel>
                                    <FormControl>
                                        <Textarea {...field} />
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                    </div>
                </form>
            </Form>
            case 4: return <div>
                <FileUploader />
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
                <div className="text-center space-x-1">
                    <Button onClick={handlePrev}>上一步</Button>
                    <Button onClick={handleNext}>下一步</Button>
                </div>
            </div>
        </DialogContent>
    </Dialog>
}