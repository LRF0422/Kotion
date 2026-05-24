import React, { forwardRef, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Plus } from "@kn/icon";
import { useSafeState } from "ahooks";
import { CompactEmoji, fetchEmojis } from "emojibase";
import { ScrollArea } from "./ui/scroll-area";
import { Input } from "./ui/input";
import { EmojiPicker, EmojiPickerContent, EmojiPickerSearch } from "./ui/emoji-picker";

export type IconType = 'IMAGE' | 'EMOJI'

export interface IconPropsProps {
    type: IconType
    icon: string
}

export interface IconSelectorProps {
    onChange: (icon: IconPropsProps) => void
    onRemove?: () => void
    value?: IconPropsProps
}

export const EmojiSelector: React.FC<{ onChange: (value: IconPropsProps) => void }> = ({ onChange }) => {
    const [emoji, setEmoji] = useSafeState<CompactEmoji[]>([])
    useEffect(() => {
        fetchEmojis('zh', { compact: true, flat: true }).then(res => {
            setEmoji(res)
        })
    }, [])
    return <div className="flex flex-col gap-1 items-center">
        <Input placeholder="筛选" />
        <ScrollArea className="h-[250px] w-full">
            <div className="flex flex-row flex-wrap">
                {emoji && emoji.map((item, index) => (
                    <div className="flex items-center justify-center h-[35px] w-[35px] hover:bg-muted rounded-sm cursor-pointer text-[30px]"
                        key={index}
                        onClick={() => {
                            const value: IconPropsProps = {
                                type: 'EMOJI',
                                icon: item.unicode
                            }
                            onChange && onChange(value)
                        }}
                    >
                        {item.unicode}
                    </div>
                ))}
            </div>
        </ScrollArea>
    </div>
}


export const IconSelector = forwardRef<HTMLDivElement, IconSelectorProps>((props, ref) => {

    const [icon, setIcon] = useSafeState<IconPropsProps | undefined>(props.value)

    const handleRemove = () => {
        setIcon(undefined)
        props.onRemove && props.onRemove()
    }

    const praseIcon = () => {
        if (icon) {
            if (icon.type === 'EMOJI') {
                return <div className="text-[80px]">
                    {icon.icon}
                </div>
            } else {
                return <img src={icon.icon} width="80px" height="80px"></img>
            }
        }

        return <Plus />
    }

    return <Popover modal>
        <PopoverTrigger>
            <div ref={ref} className="flex h-[80px] w-[80px] rounded-sm justify-center items-center bg-muted/50 hover:bg-muted">
                {
                    praseIcon()
                }
            </div>
        </PopoverTrigger>
        <PopoverContent side="right" align="start" className="w-[352px] p-0" asChild>
            <Tabs defaultValue="emoji">
                <div className="flex items-center border-b">
                    <TabsList className="bg-transparent border-none h-10 p-0 px-2 gap-0">
                        <TabsTrigger
                            value="emoji"
                            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none px-3 h-10 font-medium"
                        >
                            Emoji
                        </TabsTrigger>
                        <TabsTrigger
                            value="icons"
                            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none px-3 h-10 font-medium"
                        >
                            Icons
                        </TabsTrigger>
                    </TabsList>
                    <button
                        onClick={handleRemove}
                        className="ml-auto mr-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Remove
                    </button>
                </div>
                <TabsContent value="emoji" className="mt-0">
                    <EmojiPicker className="w-full h-[380px]" onEmojiSelect={(value) => {
                        setIcon({
                            type: 'EMOJI',
                            icon: value.emoji
                        })
                        props.onChange && props.onChange({
                            type: 'EMOJI',
                            icon: value.emoji
                        })
                    }} >
                        <EmojiPickerSearch />
                        <EmojiPickerContent />
                    </EmojiPicker>
                </TabsContent>
                <TabsContent value="icons" className="mt-0 p-3">
                    <p className="text-sm text-muted-foreground">Icons coming soon...</p>
                </TabsContent>
            </Tabs>
        </PopoverContent>
    </Popover>
}) 