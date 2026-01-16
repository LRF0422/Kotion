import { IconPropsProps, IconSelector } from "@kn/ui";
import { Form, FormControl, FormField, FormItem, FormLabel, FormDescription, FormMessage } from "@kn/ui";
import { Input } from "@kn/ui";
import { Textarea } from "@kn/ui";
import { Plus, Upload, CheckCircle2 } from "@kn/icon";
import React, { useContext, useState } from "react";
import { Button } from "@kn/ui";
import { SettingContext } from "..";
import { z } from "@kn/ui";
import { useForm } from "@kn/ui";
import { zodResolver } from "@kn/ui";
import { useApi, useUploadFile } from "@kn/core";
import { APIS } from "../../../../api";
import { toast } from "@kn/ui";
import { Separator } from "@kn/ui";
import { useTranslation } from "@kn/common";


export const Basic: React.FC = () => {

    const { space } = useContext(SettingContext)
    const { upload, usePath } = useUploadFile()
    const [isSubmitting, setIsSubmitting] = useState(false)
    const { t } = useTranslation()

    const FormSchema = z.object({
        id: z.string(),
        icon: z.instanceof(Object, { message: "Icon is required" }),
        name: z.string({
            error: t("space-settings.basic.name.required")
        }).min(1, t("space-settings.basic.name.required")),
        description: z.string().optional(),
        cover: z.string().optional()
    })

    const form = useForm<z.infer<typeof FormSchema>>({
        resolver: zodResolver(FormSchema),
        values: space as any
    })

    async function onSubmit(values: z.infer<typeof FormSchema>) {
        setIsSubmitting(true)
        try {
            await useApi(APIS.CREATE_SPACE, null, values)
            toast.success(t("space-settings.basic.save"), {
                description: t("space-settings.basic.basic-description"),
                icon: <CheckCircle2 className="h-4 w-4" />
            })
        } catch (error) {
            toast.error(t("space-settings.error", { defaultValue: "Failed to save settings" }), {
                description: t("space-settings.basic.retry", { defaultValue: "Please try again later." })
            })
        } finally {
            setIsSubmitting(false)
        }
    }

    return <Form {...form}>
        <form className="space-y-8" onSubmit={form.handleSubmit(onSubmit)}>
            <div>
                <h3 className="text-lg font-semibold mb-1">{t("space-settings.basic.title")}</h3>
                <p className="text-sm text-muted-foreground mb-6">{t("space-settings.basic.description")}</p>
                <Separator className="mb-6" />

                <div className="space-y-6">
                    <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t("space-settings.basic.name.label")} <span className="text-destructive">*</span></FormLabel>
                                <FormControl>
                                    <Input
                                        autoComplete="off"
                                        placeholder={t("space-settings.basic.name.placeholder")}
                                        className="max-w-md"
                                        {...field}
                                    />
                                </FormControl>
                                <FormDescription>
                                    {t("space-settings.basic.name.help", { defaultValue: "This is the display name for your space" })}
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
                                <FormLabel>{t("space-settings.basic.description.label")}</FormLabel>
                                <FormControl>
                                    <Textarea
                                        placeholder={t("space-settings.basic.description.placeholder")}
                                        className="max-w-md resize-none"
                                        rows={4}
                                        {...field}
                                    />
                                </FormControl>
                                <FormDescription>
                                    {t("space-settings.basic.description.help")}
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
            </div>

            <div>
                <h3 className="text-lg font-semibold mb-1">{t("space-settings.appearance.title", { defaultValue: "Appearance" })}</h3>
                <p className="text-sm text-muted-foreground mb-6">{t("space-settings.appearance.description", { defaultValue: "Customize how your space looks" })}</p>
                <Separator className="mb-6" />

                <div className="space-y-6">
                    <FormField
                        control={form.control}
                        name="icon"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t("space-settings.basic.icon.label")} <span className="text-destructive">*</span></FormLabel>
                                <FormControl>
                                    <div>
                                        <IconSelector
                                            value={field.value as IconPropsProps}
                                            onChange={field.onChange}
                                        />
                                    </div>
                                </FormControl>
                                <FormDescription>
                                    {t("space-settings.basic.icon.help")}
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
                                <FormLabel>{t("space-settings.basic.cover.label")}</FormLabel>
                                <FormControl>
                                    <div className="space-y-4">
                                        <div
                                            className="relative flex items-center justify-center h-[240px] w-full max-w-md border-2 border-dashed rounded-lg hover:bg-muted/50 cursor-pointer transition-all group overflow-hidden"
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
                                                        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
                                                            <Upload className="h-6 w-6 text-primary" />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium">{t("space-settings.basic.cover.upload")}</p>
                                                        <p className="text-xs text-muted-foreground mt-1">{t("space-settings.basic.cover.browse")}</p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <div className="text-white text-center space-y-1">
                                                        <Upload className="h-6 w-6 mx-auto" />
                                                        <p className="text-sm font-medium">{t("space-settings.basic.cover.change")}</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        {field.value && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => field.onChange('')}
                                            >
                                                {t("space-settings.basic.cover.remove")}
                                            </Button>
                                        )}
                                    </div>
                                </FormControl>
                                <FormDescription>
                                    {t("space-settings.basic.cover.help")}
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
            </div>

            <div className="flex items-center gap-3 pt-4">
                <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="min-w-[120px]"
                >
                    {isSubmitting ? t("space-settings.basic.saving") : t("space-settings.basic.save")}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => form.reset()}
                    disabled={isSubmitting}
                >
                    {t("space-settings.basic.cancel")}
                </Button>
            </div>
        </form>
    </Form>
}