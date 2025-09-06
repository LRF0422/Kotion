import React, { useCallback, useEffect, useState } from "react";
import { KnowledgeFile, useApi, useUploadFile } from "../../../hooks";
import { Avatar, Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger, IconButton, Input, Label, Tabs, TabsContent, TabsList, TabsTrigger } from "@kn/ui";
import { PlusIcon, SearchIcon, UploadIcon, XIcon } from "@kn/icon";
import { PluginUploader } from "../PluginUploader";
import { APIS } from "../../../api";
import { CollaborationEditor } from "@kn/editor";
import { isObject } from "lodash";

export interface PluginListProps {
    data: any[]
}
export const PluginList: React.FC<PluginListProps> = (props) => {

    const { usePath, upload } = useUploadFile()
    const [open, setOpen] = useState(false)
    const [currentId, setCurrentId] = useState<string>()
    const [currentPlugin, setCurrentPlugin] = useState<any>()
    const [file, setFile] = useState<KnowledgeFile>()
    const [descriptions, setDescriptions] = React.useState<any[]>([])

    useEffect(() => {
        if (currentId) {
            useApi(APIS.GET_PLUGIN, { id: currentId }).then(res => {
                const desc: any[] = res.data.currentVersion.versionDescription || []
                setCurrentPlugin(res.data)
                setDescriptions(desc.length > 0? res.data.currentVersion.versionDescription : [
                    { label: "Feature", content: {} },
                    { label: "Detail", content: {} },
                    { label: "ChangeLog", content: {} },
                ])
                setOpen(true)
            })
        }
    }, [currentId])

    const publish = useCallback(() => {
        console.log('file', file);
        
        useApi(APIS.CREATE_PLUGIN, null, {
            id: currentPlugin.id,
            resourcePath: file?.name,
            publish: true,
            versionDescs: descriptions.map(item => {
                return {
                    label: item.label,
                    content: JSON.stringify(item.content),
                }
            })
        }).then(() => {
            setOpen(false)
        })
    }, [currentPlugin, file, descriptions])
    return <div className="px-2">
        <div className="flex items-center gap-2 mb-4">
            <Input icon={<SearchIcon className="h-4 w-4" />} placeholder="Search Plugin" />
            <PluginUploader>
                <Button size="sm" variant="ghost"><PlusIcon className="h-4 w-4 mr-2" />New Plugin</Button>
            </PluginUploader>
        </div>
        {props.data.map((item, index) => {
            return <div key={index} className="px-2 py-2 bg-muted/50 hover:bg-muted mt-1 mb-1 rounded-sm flex justify-between">
                <div className="flex items-center gap-2">
                    <Avatar>
                        <img src={usePath(item.icon)} />
                    </Avatar>
                    <div>
                        <div className="text-sm">{item.name} <Badge className="h-4">{item.status.desc}</Badge></div>
                        <div className="text-nowrap overflow-hidden text-ellipsis w-[200px] text-xs italic text-gray-500">{item.developer} / {item.maintainer}</div>
                    </div>
                </div>
                <div>
                    <Button size="sm" variant="link" >Edit</Button>
                    <Button size="sm" variant="link" >Active</Button>
                    <Button size="sm" variant="link" onClick={() => {
                        if (currentId === item.id) {
                            setOpen(true)
                        } else {
                            setCurrentId(item.id)
                        }
                    }} >Publish New Version</Button>
                </div>
            </div>
        })}
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger />
            <DialogContent className="max-w-none w-[80%]">
                <DialogTitle>{currentPlugin?.name}</DialogTitle>
                <DialogDescription />
                <Avatar>
                    <img src={usePath(currentPlugin?.icon)} />
                </Avatar>
                {/* <Label>Key</Label>
                <Input value={currentPlugin?.key} disabled /> */}
                <Label>Developer</Label>
                <Input value={currentPlugin?.developer} disabled />
                <Label>Maintainer</Label>
                <Input value={currentPlugin?.maintainer} disabled />
                <Label>Upload Your Plugin</Label>
                <Button
                    className="w-[200px]"
                    onClick={() => {
                    upload().then(res => {
                        setFile(res)
                    })
                }}><UploadIcon className="h-4 w-4" /></Button>
                {file && (
                    <div className=" relative">
                        {file.originalName}
                        <IconButton className="absolute right-0 top-0" icon={<XIcon className="h-4 w-4" />} />
                    </div>
                )}
                { descriptions && descriptions.length > 0 && <Tabs defaultValue={descriptions[0].label}>
                    <TabsList>
                        {descriptions.map((item, index) => (
                            <TabsTrigger key={index} value={item.label}>{item.label}</TabsTrigger>
                        ))}
                        <IconButton icon={<PlusIcon className="h-4 w-4" />} className="ml-1" />
                    </TabsList>
                    <div className="h-full">
                        {descriptions.map((item: any, index) => (
                            <TabsContent key={index} value={item.label} className=" border rounded-sm h-full overflow-auto">
                                <CollaborationEditor
                                    id=""
                                    content={isObject(item.content) ? item.content : JSON.parse(item.content)}
                                    isEditable
                                    width="w-full"
                                    withTitle={false}
                                    toc={false}
                                    toolbar={true}
                                    user={null}
                                    token=""
                                    className="h-[250px] prose-sm"
                                    onBlur={(editor) => {
                                        const content = editor.getJSON();
                                        setDescriptions((data) => data.map((it, i) => i === index ? { ...it, content } : it))
                                    }}
                                />
                            </TabsContent>
                        ))
                        }
                    </div>
                </Tabs>}
                <DialogFooter>
                    <Button onClick={publish}>Publish</Button>
                    <Button onClick={() => {
                        setOpen(false)
                        setFile(undefined)
                    }}>Cancel</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
}