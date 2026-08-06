import { APIS } from "../../api";
import { DialogDescription, IconSelector, IconPropsProps } from "@kn/ui";
import { Button } from "@kn/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@kn/ui";
import { Form, FormControl, FormField, FormItem, FormLabel, FormDescription, FormMessage } from "@kn/ui";
import { Input } from "@kn/ui";
import { Textarea } from "@kn/ui";
import { Separator } from "@kn/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@kn/ui";
import { toast } from "@kn/ui";
import { useApi, GlobalState } from "@kn/common";
import { zodResolver } from "@kn/ui";
import { CheckCircle2, Users, BookOpen } from "@kn/icon";
import React, { ReactNode, useState } from "react";
import { useForm } from "@kn/ui";
import { useSelector, useTranslation } from "@kn/common";
import { z } from "@kn/ui";

export interface SpaceFormProps {
    callBack?: () => void
}

export const SpaceForm: React.FC<SpaceFormProps> = (props) => {

    const { userInfo } = useSelector((state: GlobalState) => state)
    const { t } = useTranslation()
    const [isSubmitting, setIsSubmitting] = useState(false)

    const FormSchema = z.object({
        icon: z.object({
            type: z.enum(["EMOJI", "IMAGE"]),
            icon: z.string()
        }),
        name: z.string({
            error: t("creation.name-required", "Space name is required")
        }).min(1, t("creation.name-required", "Space name is required")),
        description: z.string().optional(),
        type: z.enum(["SPACE", "COLLABORATION"]).default("SPACE"),
        nickName: z.string().default(userInfo?.name as string),
        userId: z.string().default(userInfo?.id as string),
        cover: z.string()
    })

    const form = useForm<z.infer<typeof FormSchema>>({
        resolver: zodResolver(FormSchema),
        defaultValues: {
            icon: {
                type: "EMOJI",
                icon: "🚀"
            },
            name: "",
            description: "",
            type: "SPACE",
            cover: "",
            nickName: userInfo?.name,
            userId: userInfo?.id
        }
    })

    async function onSubmit(values: z.infer<typeof FormSchema>) {
        setIsSubmitting(true)
        try {
            await useApi(APIS.CREATE_SPACE, null, values)
            toast.success(t("creation.success", "Space created successfully"), {
                icon: <CheckCircle2 className="h-4 w-4" />
            })
            props.callBack && props.callBack()
        } catch (error) {
            toast.error(t("creation.error", "Failed to create space"), {
                description: t("creation.retry", "Please try again later.")
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Form {...form}>
            <form id="create-space-form" className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
                {/* Basic Information Section */}
                <div className="space-y-4">
                    <div>
                        <h4 className="text-sm font-medium text-foreground">{t("creation.section-basic", "Basic Information")}</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">{t("creation.section-basic-desc", "Set the basic information for your new space")}</p>
                    </div>
                    <Separator />

                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>
                                    {t("creation.name", "Space Name")} <span className="text-destructive">*</span>
                                </FormLabel>
                                <FormControl>
                                    <Input
                                        autoComplete="off"
                                        placeholder={t("creation.name-placeholder", "Enter space name")}
                                        {...field}
                                    />
                                </FormControl>
                                <FormDescription>
                                    {t("creation.name-help", "This is the display name for your space")}
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="description"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t("creation.desc", "Description")}</FormLabel>
                                <FormControl>
                                    <Textarea
                                        placeholder={t("creation.desc-placeholder", "Describe what this space is about")}
                                        className="resize-none"
                                        rows={3}
                                        {...field}
                                    />
                                </FormControl>
                                <FormDescription>
                                    {t("creation.desc-help", "A brief description helps others understand the purpose of this space")}
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="type"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t("creation.type", "Space Type")}</FormLabel>
                                <FormControl>
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder={t("creation.type-placeholder", "Select space type")} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="SPACE">
                                                <div className="flex items-center gap-2">
                                                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                                                    <div>
                                                        <span>{t("creation.type-normal", "Normal Space")}</span>
                                                    </div>
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="COLLABORATION">
                                                <div className="flex items-center gap-2">
                                                    <Users className="h-4 w-4 text-blue-500" />
                                                    <div>
                                                        <span>{t("creation.type-collaboration", "Collaboration Space")}</span>
                                                    </div>
                                                </div>
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </FormControl>
                                <FormDescription>
                                    {field.value === 'COLLABORATION'
                                        ? t("creation.type-collab-desc", "Team workspace with member management, activity feed and real-time collaboration")
                                        : t("creation.type-normal-desc", "Standard space for organizing and sharing knowledge")}
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                {/* Appearance Section */}
                <div className="space-y-4">
                    <div>
                        <h4 className="text-sm font-medium text-foreground">{t("creation.section-appearance", "Appearance")}</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">{t("creation.section-appearance-desc", "Customize how your space looks")}</p>
                    </div>
                    <Separator />

                    <FormField
                        control={form.control}
                        name="icon"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>
                                    {t("creation.icon", "Icon")} <span className="text-destructive">*</span>
                                </FormLabel>
                                <FormControl>
                                    <IconSelector
                                        onChange={field.onChange}
                                        value={field.value as IconPropsProps}
                                    />
                                </FormControl>
                                <FormDescription>
                                    {t("creation.icon-help", "Choose an emoji or image as the space icon")}
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
            </form>
        </Form>
    )
}


export const CreateSpaceDlg = (props: { trigger: ReactNode, callBack?: () => void }) => {

    const [visible, setVisible] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const { t } = useTranslation()

    return (
        <Dialog open={visible} onOpenChange={(open) => {
            if (!isSubmitting) setVisible(open)
        }}>
            <DialogTrigger asChild onClick={() => setVisible(true)}>
                {props.trigger}
            </DialogTrigger>
            <DialogContent className="max-w-[560px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{t("creation.title", "Create New Space")}</DialogTitle>
                    <DialogDescription>
                        {t("creation.dialog-desc", "Create a new space to organize your content and collaborate with others.")}
                    </DialogDescription>
                </DialogHeader>
                <SpaceForm callBack={() => {
                    props.callBack && props.callBack()
                    setVisible(false)
                }} />
                <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => setVisible(false)}
                        disabled={isSubmitting}
                    >
                        {t("creation.cancel", "Cancel")}
                    </Button>
                    <Button
                        type="submit"
                        form="create-space-form"
                        disabled={isSubmitting}
                    >
                        {isSubmitting
                            ? t("creation.creating", "Creating...")
                            : t("creation.submit", "Create Space")
                        }
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}