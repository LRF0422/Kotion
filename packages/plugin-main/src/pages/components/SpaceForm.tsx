import { APIS } from "../../api";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, DialogDescription, IconSelector } from "@kn/ui";
import { Button } from "@kn/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@kn/ui";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@kn/ui";
import { Input } from "@kn/ui";
import { Textarea } from "@kn/ui";
import { useApi, useUploadFile } from "@kn/core";
import { GlobalState } from "@kn/core";
import { zodResolver } from "@kn/ui";
import { Plus } from "@kn/icon";
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

    const FormSchema = z.object({
        icon: z.object({
            type: z.enum(["EMOJI", "IMAGE"]),
            icon: z.string()
        }),
        name: z.string({
            required_error: "You need to type a space name"
        }),
        description: z.string(),
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
            cover: "upload/20251022/2c9402c970f95483446ded792b32ac22.png",
            nickName: userInfo?.name,
            userId: userInfo?.id
        }
    })

    function onSubmit(values: z.infer<typeof FormSchema>) {
        useApi(APIS.CREATE_SPACE, null, values).then(() => {
            props.callBack && props.callBack()
        })
    }

    const covers: any[] = [
        "upload/20251022/2c9402c970f95483446ded792b32ac22.png",
        "upload/20251023/5d372ef092428d58e995d1b910173641.png",
        "upload/20251023/05508f818232fd72e08caff65669d014.png",
        "upload/20251024/e409eaacdbab8e9fa9ed6d40181ca911.png"
    ]

    return <div className="w-full">
        <Form {...form}  >
            <form className="flex flex-col gap-2" onSubmit={form.handleSubmit(onSubmit)}>
                <FormField
                    control={form.control}
                    name="icon"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t("creation.icon")}</FormLabel>
                            <FormControl>
                                <div>
                                    <IconSelector onChange={field.onChange} value={field.value} />
                                </div>
                            </FormControl>
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="cover"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t("creation.cover")}</FormLabel>
                            <FormControl>
                                <div className="flex items-center gap-5">
                                    <div className="flex items-center justify-center h-[200px] w-[150px] rounded-sm bg-muted/50  hover:bg-muted cursor-pointer"
                                        style={{
                                            backgroundImage: `url('${usePath(field.value)}')`,
                                            backgroundSize: 'cover'
                                        }}
                                        onClick={() => {
                                            upload().then(res => {
                                                field.onChange(res.name)
                                            })
                                        }}
                                    >
                                        {!field.value && <Plus />}
                                    </div>
                                    <div className="w-[300px]">
                                        <Carousel
                                            opts={{
                                                align: "start",
                                            }}
                                            className="w-full ml-[50px] mr-[50px] max-w-sm"
                                        >
                                            <CarouselContent className="p-1">
                                                {
                                                    covers.map((cover, index) => (
                                                        <CarouselItem key={index} className="basis-1/2" onClick={() => {
                                                            field.onChange(cover)
                                                        }}>
                                                            <img src={usePath(cover)} alt="cover" className="hover:shadow-md hover:outline cursor-pointer rounded-sm transition-[outline] duration-75 w-full h-[200px]" />
                                                        </CarouselItem>
                                                    ))
                                                }
                                                <CarouselItem className=" basis-1/2">
                                                    <div className="h-[200px] w-full rounded-sm cursor-pointer duration-75 flex items-center justify-center ">
                                                        <Button size="sm">More Cover</Button>
                                                    </div>
                                                </CarouselItem>
                                            </CarouselContent>
                                            <CarouselPrevious />
                                            <CarouselNext />
                                        </Carousel>
                                    </div>
                                </div>
                            </FormControl>
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t("creation.name")}</FormLabel>
                            <FormControl>
                                <Input autoComplete="off" {...field} placeholder="Name for the space" />
                            </FormControl>
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>{t("creation.desc")}</FormLabel>
                            <FormControl>
                                <Textarea {...field} placeholder="Description for the space" autoComplete="off" />
                            </FormControl>
                        </FormItem>
                    )}
                />
                <Button type="submit">新建</Button>
            </form>
        </Form>
    </div>
}


export const CreateSpaceDlg = (props: { trigger: ReactNode, callBack?: () => void }) => {

    const [visible, setVisible] = useState(false)
    const { t } = useTranslation()

    return <Dialog open={visible} onOpenChange={setVisible}>
        <DialogTrigger onClick={() => setVisible(true)}>{props.trigger}</DialogTrigger>
        <DialogContent className="h-auto max-w-none w-[650px]">
            <DialogHeader>
                <DialogTitle>{t("creation.title")}</DialogTitle>
                <DialogDescription></DialogDescription>
                <SpaceForm callBack={() => {
                    props.callBack && props.callBack()
                    setVisible(false)
                }} />
            </DialogHeader>
        </DialogContent>
    </Dialog>
}