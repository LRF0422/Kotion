import { APIS } from "../../api";
import { IconSelector } from "@repo/ui";
import { Button } from "@repo/ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@repo/ui";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@repo/ui";
import { Input } from "@repo/ui";
import { Textarea } from "@repo/ui";
import { useApi } from "../../hooks/use-api";
import { GlobalState } from "../../store/GlobalState";
import { upload } from "../../utils/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import React, { ReactNode, useState } from "react";
import { useForm } from "react-hook-form";
import { useSelector } from "react-redux";
import { z } from "zod";

export interface SpaceFormProps {
    callBack?: () => void
}

export const SpaceForm: React.FC<SpaceFormProps> = (props) => {

    const { userInfo } = useSelector((state: GlobalState) => state)

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
                                                field.onChange(res.data.name)
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