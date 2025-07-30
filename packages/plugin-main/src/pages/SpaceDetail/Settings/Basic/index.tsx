import { IconPropsProps, IconSelector } from "@kn/ui";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@kn/ui";
import { Input } from "@kn/ui";
import { Textarea } from "@kn/ui";
import { Plus } from "@kn/icon";
import React, { useContext } from "react";
import { Button } from "@kn/ui";
import { SettingContext } from "..";
import { z } from "@kn/ui";
import { useForm } from "@kn/ui";
import { zodResolver } from "@kn/ui";
import { useApi, useUploadFile } from "@kn/core";
import { APIS } from "../../../../api";
import { toast } from "@kn/ui";


export const Basic: React.FC = () => {

    const { space } = useContext(SettingContext)
    const { upload } = useUploadFile()

    const FormSchema = z.object({
        id: z.string(),
        icon: z.instanceof(Object, { message: "Icon is required" }),
        name: z.string({
            required_error: "You need to type a space name"
        }),
        description: z.string(),
        cover: z.string()
    })

    const form = useForm<z.infer<typeof FormSchema>>({
        resolver: zodResolver(FormSchema),
        values: space as any
    })

    function onSubmit(values: z.infer<typeof FormSchema>) {
        console.log('values', values);
        useApi(APIS.CREATE_SPACE, null, values).then(() => {
            toast.success("修改成功")
        })
    }

    return <Form {...form}  >
        <form className="flex flex-col gap-2 w-[300px]" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
                control={form.control}
                name="icon"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>图标</FormLabel>
                        <FormControl>
                            <div>
                                <IconSelector value={field.value as IconPropsProps} onChange={field.onChange} />
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
                        <FormControl defaultValue={space?.cover}>
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
            <Button type="submit">保存</Button>
        </form>
    </Form>
}