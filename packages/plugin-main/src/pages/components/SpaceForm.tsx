import { APIS } from "../../api";
import { IconSelector } from "@kn/ui";
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
import { useSelector } from "@kn/core";
import { z } from "@kn/ui";

export interface SpaceFormProps {
    callBack?: () => void
}

export const SpaceForm: React.FC<SpaceFormProps> = (props) => {

    const { userInfo } = useSelector((state: GlobalState) => state)
    const { upload } = useUploadFile()

    const FormSchema = z.object({
        icon: z.instanceof(Object, { message: "Icon is required" }),
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
    })

    function onSubmit(values: z.infer<typeof FormSchema>) {
        useApi(APIS.CREATE_SPACE, null, values).then(() => {
            props.callBack && props.callBack()
        })
    }

    return <div>
        <Form {...form}  >
            <form className="flex flex-col gap-2" onSubmit={form.handleSubmit(onSubmit)}>
                <FormField
                    control={form.control}
                    name="icon"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>图标</FormLabel>
                            <FormControl>
                                <div>
                                    <IconSelector onChange={field.onChange} />
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
                            <FormLabel>封面</FormLabel>
                            <FormControl>
                                <div>
                                    <div className="flex items-center justify-center h-[200px] w-[150px] border border-dashed rounded-sm hover:bg-muted cursor-pointer"
                                        style={{
                                            backgroundImage: `url('http://www.simple-platform.cn:88/knowledge-resource/oss/endpoint/download?fileName=${field.value}')`,
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
                            <FormLabel>名称</FormLabel>
                            <FormControl>
                                <Input autoComplete="off" {...field} />
                            </FormControl>
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>描述</FormLabel>
                            <FormControl>
                                <Textarea {...field} />
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

    return <Dialog open={visible} onOpenChange={setVisible}>
        <DialogTrigger onClick={() => setVisible(true)}>{props.trigger}</DialogTrigger>
        <DialogContent className="h-auto">
            <DialogHeader>
                <DialogTitle>新建空间</DialogTitle>
                <SpaceForm callBack={() => {
                    props.callBack && props.callBack()
                    setVisible(false)
                }} />
            </DialogHeader>
        </DialogContent>
    </Dialog>
}