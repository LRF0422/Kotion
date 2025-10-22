import { useSelector } from "@kn/common";
import { GlobalState, useApi, useUploadFile } from "@kn/core";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel,
    AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
    AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger, Avatar, Button, Controller, Field,
    FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet, FileUploader, Input, ScrollArea, TagInput, Textarea, cn, toast, useForm, z, zodResolver
} from "@kn/ui";
import React, { PropsWithChildren, useRef } from "react";
import { APIS } from "../../../api";


export interface TemplateCreatorProps extends PropsWithChildren {
    space: any,
    className?: string
}

const formSchema = z.object({
    spaceId: z.string(),
    name: z.string(),
    description: z.string(),
    cover: z.array(z.string()),
    categories: z.array(z.object({
        id: z.string(),
        text: z.string()
    })),
})

export const TemplateCreator: React.FC<TemplateCreatorProps> = (props) => {
    const { space, className } = props
    const { userInfo } = useSelector((state: GlobalState) => state)
    const { usePath, uploadFile } = useUploadFile()
    const ref = useRef<HTMLFormElement>(null)

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: space.name,
            spaceId: space.id,
            description: space.description,
            cover: space.cover,
            categories: space.categories
        }
    })

    const onSubmit = (values: z.infer<typeof formSchema>) => {
        console.log(values)
        useApi(APIS.SAVE_SPACE_AS_TEMPLATE, null, values).then(() => {
            toast.success("创建成功")
        })
    }

    return <AlertDialog>
        <AlertDialogTrigger className={className}>{props.children}</AlertDialogTrigger>
        <AlertDialogContent className={cn(" max-w-none w-[80%] max-h-[90%] 3xl:w-[60%]")}>
            <AlertDialogHeader>
                <AlertDialogTitle>Save as template</AlertDialogTitle>
                <AlertDialogDescription />
                <ScrollArea className="h-[90%]">
                    <form ref={ref} action="#" onSubmit={form.handleSubmit(onSubmit)} id="template-form">
                        <FieldGroup>
                            <FieldSet className="p-2">
                                <FieldLegend>Payment Method</FieldLegend>
                                <FieldDescription>
                                    All transactions are secure and encrypted
                                </FieldDescription>
                                <FieldGroup>
                                    <Field>
                                        <FieldLabel>Author</FieldLabel>
                                        <Avatar>
                                            <img src={usePath(userInfo?.avatar as string)} alt="" />
                                        </Avatar>
                                    </Field>
                                    <Controller
                                        name="name"
                                        control={form.control}
                                        render={({ field }) => (
                                            <Field>
                                                <FieldLabel>Template Nane</FieldLabel>
                                                <Input {...field} />
                                            </Field>
                                        )}
                                    />
                                    <Controller
                                        name="cover"
                                        control={form.control}
                                        render={({ field }) => (
                                            <Field>
                                                <FieldLabel>Cover</FieldLabel>
                                                <FileUploader multiple maxFileCount={5} onUpload={(files) => {
                                                    return Promise.all(files.map(it => {
                                                        return uploadFile(it).then(res => {
                                                            return usePath(res.name)
                                                        })
                                                    })).then(res => {
                                                        field.onChange(res)
                                                    })
                                                }} />
                                            </Field>
                                        )}
                                    />
                                    <Controller
                                        name="description"
                                        control={form.control}
                                        render={({ field }) => (
                                            <Field>
                                                <FieldLabel>Description</FieldLabel>
                                                <Textarea {...field} />
                                            </Field>
                                        )}
                                    />
                                </FieldGroup>
                            </FieldSet>
                        </FieldGroup>
                    </form>
                </ScrollArea>
                <AlertDialogFooter>
                    <AlertDialogAction onClick={() => {
                        ref.current?.submit()
                    }}>
                        Confirm
                    </AlertDialogAction>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                </AlertDialogFooter>
            </AlertDialogHeader>
        </AlertDialogContent>
    </AlertDialog>
}