import { useSelector } from "@kn/common";
import { GlobalState, useUploadFile } from "@kn/core";
import { Alert, AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger, Avatar, Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet, FileUploader, Input, Item, ItemContent, ItemDescription, ItemTitle, ScrollArea, Textarea } from "@kn/ui";
import React, { PropsWithChildren } from "react";


export interface TemplateCreatorProps extends PropsWithChildren {
    space: any
}

export const TemplateCreator: React.FC<TemplateCreatorProps> = (props) => {
    const { space } = props
    const { userInfo } = useSelector((state: GlobalState) => state)
    const { usePath } = useUploadFile()
    return <AlertDialog>
        <AlertDialogTrigger>{props.children}</AlertDialogTrigger>
        <AlertDialogContent className=" max-w-none w-[80%] max-h-[80%]">
            <AlertDialogHeader>
                <AlertDialogTitle>Save as template</AlertDialogTitle>
                <AlertDialogDescription />
                <ScrollArea className="h-[80%-200px]">
                    <form>
                        <FieldGroup>
                            <FieldSet>
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
                                    <Field>
                                        <FieldLabel>Template Name</FieldLabel>
                                        <Input value={space.name} />
                                    </Field>
                                    <Field>
                                        <FieldLabel>Cover</FieldLabel>
                                        <FileUploader />
                                    </Field>
                                    <Field>
                                        <FieldLabel>Full Description</FieldLabel>
                                        <Textarea />
                                    </Field>
                                </FieldGroup>
                            </FieldSet>
                        </FieldGroup>
                    </form>
                </ScrollArea>
                <AlertDialogFooter>
                    <AlertDialogAction>Confirm</AlertDialogAction>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                </AlertDialogFooter>
            </AlertDialogHeader>
        </AlertDialogContent>
    </AlertDialog>
}