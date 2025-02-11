import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, Form, FormControl, FormField, FormItem, FormLabel, Input, Step, Stepper, useForm, zodResolver } from "@repo/ui";
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
            </Form>
            default: return <div>123123</div>
        }
    }

    return <Dialog>
        <DialogTrigger asChild>{children}</DialogTrigger>
        <DialogContent className="w-[800px] max-w-none">
            <DialogHeader>
                <DialogTitle>上传插件</DialogTitle>
                <DialogDescription />
            </DialogHeader>
            <div className="">
                <Stepper
                    steps={steps}
                    currentStep={currentStep}
                    onStepClick={handleStepClick}
                    className="h-full"
                />
                {render()}
            </div>
            <div className="text-center space-x-1">
                <Button onClick={handlePrev}>上一步</Button>
                <Button onClick={handleNext}>下一步</Button>
            </div>
        </DialogContent>
    </Dialog>
}