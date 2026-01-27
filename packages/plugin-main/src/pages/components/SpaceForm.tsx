import { APIS } from "../../api";
import { DialogDescription, IconSelector, IconPropsProps, cn } from "@kn/ui";
import { Button } from "@kn/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@kn/ui";
import { Form, FormControl, FormField, FormItem, FormLabel, FormDescription, FormMessage } from "@kn/ui";
import { Input } from "@kn/ui";
import { Textarea } from "@kn/ui";
import { Separator } from "@kn/ui";
import { toast } from "@kn/ui";
import { useApi, useUploadFile } from "@kn/core";
import { GlobalState } from "@kn/core";
import { zodResolver } from "@kn/ui";
import { Upload, CheckCircle2, ImageIcon } from "@kn/icon";
import React, { ReactNode, useState } from "react";
import { useForm } from "@kn/ui";
import { useSelector, useTranslation } from "@kn/common";
import { z } from "@kn/ui";

export interface SpaceFormProps {
    callBack?: () => void
}

export const SpaceForm: React.FC<SpaceFormProps> = (props) => {

    const { userInfo } = useSelector((state: GlobalState) => state)
    const { upload, usePath } = useUploadFile()
    const { t } = useTranslation()
    const [isSubmitting, setIsSubmitting] = useState(false)

    const FormSchema = z.object({
        icon: z.object({
            type: z.enum(["EMOJI", "IMAGE"]),
            icon: z.string()
        }),
        name: z.string({
            required_error: t("creation.name-required", "Space name is required")
        }).min(1, t("creation.name-required", "Space name is required")),
        description: z.string().optional(),
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
            cover: "upload/20251022/2c9402c970f95483446ded792b32ac22.png",
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

    const presetCovers: string[] = [
        "upload/20251022/2c9402c970f95483446ded792b32ac22.png",
        "upload/20251023/5d372ef092428d58e995d1b910173641.png",
        "upload/20251023/05508f818232fd72e08caff65669d014.png",
        "upload/20251024/e409eaacdbab8e9fa9ed6d40181ca911.png"
    ]

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

                    <FormField
                        control={form.control}
                        name="cover"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t("creation.cover", "Cover Image")}</FormLabel>
                                <FormControl>
                                    <div className="space-y-3">
                                        {/* Cover Preview & Upload */}
                                        <div
                                            className="relative flex items-center justify-center h-[140px] w-full border-2 border-dashed rounded-lg hover:bg-muted/50 cursor-pointer transition-all group overflow-hidden"
                                            style={{
                                                backgroundImage: field.value ? `url('${usePath(field.value)}')` : 'none',
                                                backgroundSize: 'cover',
                                                backgroundPosition: 'center'
                                            }}
                                            onClick={() => {
                                                upload().then(res => {
                                                    field.onChange(res.name)
                                                })
                                            }}
                                        >
                                            {!field.value ? (
                                                <div className="text-center space-y-2">
                                                    <div className="flex justify-center">
                                                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
                                                            <Upload className="h-5 w-5 text-primary" />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium">{t("creation.cover-upload", "Upload cover image")}</p>
                                                        <p className="text-xs text-muted-foreground mt-0.5">{t("creation.cover-browse", "Click to browse")}</p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <div className="text-white text-center space-y-1">
                                                        <Upload className="h-5 w-5 mx-auto" />
                                                        <p className="text-sm font-medium">{t("creation.cover-change", "Change cover")}</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Preset Covers */}
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <ImageIcon className="h-3 w-3" />
                                                <span>{t("creation.cover-presets", "Or choose from presets")}</span>
                                            </div>
                                            <div className="grid grid-cols-4 gap-2">
                                                {presetCovers.map((cover, index) => (
                                                    <div
                                                        key={index}
                                                        className={cn(
                                                            "relative h-16 rounded-md cursor-pointer overflow-hidden border-2 transition-all hover:scale-105",
                                                            field.value === cover
                                                                ? "border-primary ring-2 ring-primary/20"
                                                                : "border-transparent hover:border-muted-foreground/30"
                                                        )}
                                                        style={{
                                                            backgroundImage: `url('${usePath(cover)}')`,
                                                            backgroundSize: 'cover',
                                                            backgroundPosition: 'center'
                                                        }}
                                                        onClick={() => field.onChange(cover)}
                                                    >
                                                        {field.value === cover && (
                                                            <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                                                <CheckCircle2 className="h-4 w-4 text-primary" />
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </FormControl>
                                <FormDescription>
                                    {t("creation.cover-help", "A cover image makes your space more recognizable")}
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