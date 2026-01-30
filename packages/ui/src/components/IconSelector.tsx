import React, { forwardRef, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Plus } from "@kn/icon";
import { useSafeState } from "ahooks";
import { CompactEmoji, fetchEmojis } from "emojibase";
import { ScrollArea } from "./ui/scroll-area";
import { Input } from "./ui/input";
import { EmojiPicker, EmojiPickerContent, EmojiPickerFooter, EmojiPickerSearch } from "./ui/emoji-picker";

export type IconType = 'IMAGE' | 'EMOJI'

export interface IconPropsProps {
    type: IconType
    icon: string
}

export interface IconSelectorProps {
    onChange: (icon: IconPropsProps) => void
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
    const [searchValue, setSearchValue] = useSafeState()

    const handleEmojiSelect = (emoji: string) => {
        const selectedIcon: IconPropsProps = {
            type: 'EMOJI',
            icon: emoji
        }
        setIcon(selectedIcon)
        props.onChange && props.onChange(selectedIcon)
    }

    const praseIcon = () => {
        if (icon) {
            if (icon.type === 'EMOJI') {
                return <div className=" text-[80px]">
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
        <PopoverContent side="right" align="start" className="p-1" asChild>
            <Tabs defaultValue="emoji">
                <TabsList>
                    <TabsTrigger value="emoji">Emoji</TabsTrigger>
                    <TabsTrigger value="image">Image</TabsTrigger>
                </TabsList>
                <TabsContent value="emoji" className="w-full flex flex-col gap-1">
                    <EmojiPicker className="w-full h-[300px]" onEmojiSelect={(value) => {
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
                        <EmojiPickerFooter />
                    </EmojiPicker>
                </TabsContent>
                <TabsContent value="image">
                    FileUpload
                </TabsContent>
            </Tabs>
        </PopoverContent>
    </Popover>
}) 