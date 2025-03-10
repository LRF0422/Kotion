import { Button } from "@repo/ui";
import { Checkbox } from "@repo/ui";
import { DateTimePicker } from "@repo/ui";
import { Rate } from "@repo/ui";
import { Slider } from "@repo/ui";
// import { upload } from "";
import { AppWindowIcon, CheckSquare, Clock10, ImageIcon, Link2, SlidersIcon, StarIcon, TagIcon, TextIcon, TypeIcon, Upload, XCircle } from "@repo/icon";
import React, { useContext, useRef, useState } from "react";
import { textEditor } from "react-data-grid";
import { TagInput } from "@repo/ui";
import { useHover, useToggle } from "ahooks";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@repo/ui";
import { cn } from "@repo/ui";
import { NodeViewContext } from "../../DatabaseView";
import { Editor } from "@tiptap/react";
import { isArray, isObject } from "lodash";
import { getTitleContent } from "../../../../editor/utilities";
import { EditorRender } from "../../../../editor/render";


export const DateColumnEditor: React.FC<any> = (props) => {
    const { row, onRowChange, column } = props
    return <DateTimePicker
        value={new Date(row[column.key])}
        onChange={(date) => onRowChange({ ...row, [column.key]: date?.toISOString() }, true)}
        locale={undefined}
        weekStartsOn={undefined}
        showWeekNumber={undefined}
        showOutsideDays={undefined}
    />
}

export const CheckBoxEditor: React.FC<any> = (props) => {
    const { row, onRowChange, column } = props
    const value = row[column.key] || false
    return <Checkbox checked={value} onCheckedChange={(v) => onRowChange({ ...row, [column.key]: v }, false)} />
}

export const MultSelectEditor: React.FC<any> = (props) => {
    const { row, onRowChange, column } = props

    // const options = columns.find(it => it.dataType === column.key).options || []
    const [activeTagIndex, setActiveTagIndex] = useState<number | null>(null);


    const value = row[column.key] || []
    return <TagInput
        size="xs"
        className="h-full w-full"
        addTagsOnBlur={true}
        tags={value}
        setActiveTagIndex={setActiveTagIndex}
        activeTagIndex={activeTagIndex}
        setTags={(newValues) => {
            onRowChange({ ...row, [column.key]: newValues }, false)
        }}
    />
}

export const MarkdownEditor: React.FC<any> = (props) => {
    const { row, column } = props
    const data = row[column.key]
    return <div>
        {
            data && getTitleContent(data)
        }
    </div>
}

export const RateEditor: React.FC<any> = (props) => {
    const { row, onRowChange, column } = props
    const data = row[column.key] || 0
    return <Rate
        variant="yellow"
        rating={data}
        className="w-full h-full flex items-center"
        totalStars={5}
        onRatingChange={(rate) => onRowChange({ ...row, [column.key]: rate }, true)}
    />
}

export const SliderEditor: React.FC<any> = (props) => {
    const { row, onRowChange, column } = props
    const [currentValue, setCurrentValue] = useState(row[column.key] || 0)
    return <div className="flex flex-row gap-1 items-center">
        <Slider defaultValue={[currentValue]}
            onValueChange={(v) => setCurrentValue(v[0])}
            onValueCommit={(v) => onRowChange({ ...row, [column.key]: v[0] }, false)} />
        {currentValue} %
    </div>
}

export const MultSelectView: React.FC<any> = (props) => {
    const { row, onRowChange, column } = props

    // const options = columns.find(it => it.dataType === column.key).options || []
    const [activeTagIndex, setActiveTagIndex] = useState<number | null>(null);

    const value = row[column.key] || []
    return <TagInput
        size="xs"
        className="h-full w-full"
        styleClasses={{
            inlineTagsContainer: 'border-none h-full'
        }}
        borderStyle="none"
        addTagsOnBlur={true}
        tags={value}
        setActiveTagIndex={setActiveTagIndex}
        activeTagIndex={activeTagIndex}
        setTags={(newValues) => {
            onRowChange({ ...row, [column.key]: newValues }, false)
        }}
        disabled
    />
}

export const ImageCellView: React.FC<any> = (props) => {
    const { column, row } = props
    const [visible, setVisible] = useState(false)
    const value = row[column.key]
    return <div>
        {
            value && isArray(value) ? <div className="flex items-center gap-1">
                {value.map((it: any, index: number) => (
                    <div className="p-1 hover:bg-muted relative w-[30px]" key={index} onClick={() => setVisible(true)}>
                        <img src={`http://www.simple-platform.cn:88/knowledge-resource/oss/endpoint/download?fileName=${it}`} width="100%" />
                    </div>
                ))}
            </div> : <div></div>
        }
    </div>
}

export const SliderView: React.FC<any> = (props) => {
    const { column, row } = props
    const value = row[column.key] || 0

    return <div className="flex flex-row gap-1 items-center">
        <Slider defaultValue={[value]} disabled />
        {value} %
    </div>
}

export const RateView: React.FC<any> = (props) => {
    const { column, row } = props
    const value = row[column.key] || 0
    return <Rate
        className="w-full h-full"
        rating={value}
        totalStars={5}
        variant="yellow"
        disabled
    />
}

export const CheckBoxView: React.FC<any> = (props) => {
    const { column, row } = props
    const value = row[column.key] || false
    return <Checkbox disabled checked={value} />
}

export const TextCellView: React.FC<any> = (props) => {
    const { column, row } = props

    return <div>
        {
            row[column.key]
        }
    </div>
}

export const PageLinkView: React.FC<any> = (props) => {
    const { column, row } = props
    const value = row[column.key]
    return <a>
        {value.label}
    </a>
}

export const MarkdownView: React.FC<any> = (props) => {
    const ref = useRef<any>()
    const hover = useHover(ref)
    const { column, row } = props
    const value = row[column.key]
    const editor = useRef<Editor>(null)
    const { handleDataChange, data, editor: mainEditor } = useContext(NodeViewContext)
    const handleSave = (open: boolean) => {
        if (!open && editor.current && mainEditor.isEditable) {
            const json = editor.current.getJSON()
            handleDataChange(data.indexOf(row), column.idx - 1, json)
        }
    }


    return editor && <div ref={ref} className=" relative h-full w-full flex items-center">
        {isObject(value) && getTitleContent(value)}
        <Sheet onOpenChange={handleSave}>
            <SheetTrigger asChild >
                <Button size="sm" className={cn(" absolute right-0 top-0 h-full", hover ? "visible" : "invisible")}><AppWindowIcon className="h-3 w-3" /></Button>
            </SheetTrigger>
            <SheetContent className="w-[90%] sm:max-w-none">
                <SheetHeader>
                    <SheetTitle></SheetTitle>
                    <SheetDescription></SheetDescription>
                </SheetHeader>
                <div className="h-full w-full overflow-auto" onDoubleClick={(e) => e.stopPropagation()}>
                    <EditorRender content={value} id="" toolbar={false} isEditable={mainEditor.isEditable} ref={editor} />
                </div>
            </SheetContent>
        </Sheet>
    </div>
}

export const PageLinkEditor: React.FC<any> = (props) => {
    const { row, onRowChange, column } = props
    const value = row[column.key]
    return <div>
        {/* <PageSelector
            defaultValue={value ? value.value : undefined}
            onSelect={(data) => {
                onRowChange({ ...row, [column.key]: data }, true)
            }}>
            {value ? <a>{value.label}</a> : <Button>Select a page</Button>}
        </PageSelector> */}
    </div>
}

export const ImageEditor: React.FC<any> = (props) => {
    const { row, onRowChange, column } = props
    const value = row[column.key]
    const handleUpload = () => {
        // upload().then(res => {
        //     if (value) {
        //         onRowChange({ ...row, [column.key]: [...value, res.data.name] }, false)
        //     } else {
        //         onRowChange({ ...row, [column.key]: [res.data.name] }, false)
        //     }

        // })
    }

    const handleDelete = (v: string) => {
        const newValue = (value as string[]).filter(it => it !== v)
        onRowChange({ ...row, [column.key]: newValue }, false)
    }
    return <div className=" flex flex-row items-center justify-between">
        <div>
            {
                value ? <div className="flex items-center gap-1">
                    {value.map((it: any, index: number) => (
                        <div className="p-1 hover:bg-muted relative w-[30px]" key={index}>
                            <XCircle className="h-2 w-2 top-0 right-0 absolute" onClick={() => {
                                handleDelete(it)
                            }} />
                            <img src={`http://www.simple-platform.cn:88/knowledge-resource/oss/endpoint/download?fileName=${it}`} width="100%" />
                        </div>
                    ))}
                </div> : <div></div>
            }
        </div>
        <Button size="sm" onClick={handleUpload}><Upload className="h-4 w-4" /></Button>
    </div>
}

export const getCellView = (dataType: string) => {
    switch (dataType) {
        case 'image':
            return ImageCellView
        case 'slider':
            return SliderView
        case 'checkbox':
            return CheckBoxView
        case 'rate':
            return RateView
        case 'select':
            return MultSelectView
        case 'markdown':
            return MarkdownView
        case 'pageLink':
            return PageLinkView
        default:
            return TextCellView
    }
}

export const getCellIcon = (dataType: string) => {
    switch (dataType) {
        case 'image':
            return <ImageIcon className="h-4 w-4 text-gray-500" />
        case 'date-picker-cell':
            return <Clock10 className="h-4 w-4 text-gray-500" />
        case 'markdown':
            return <TypeIcon className="h-4 w-4 text-gray-500" />
        case 'slider':
            return <SlidersIcon className="h-4 w-4 text-gray-500" />
        case 'checkbox':
            return <CheckSquare className="h-4 w-4 text-gray-500" />
        case 'rate':
            return <StarIcon className="h-4 w-4 text-gray-500" />
        case 'select':
            return <TagIcon className="h-4 w-4 text-gray-500" />
        case 'pageLink':
            return <Link2 className="h-4 w-4 text-gray-500" />
        default:
            return <TextIcon className="h-4 w-4 text-gray-500" />
    }
}

export const getEditor = (dataType: string) => {
    switch (dataType) {
        case 'image':
            return ImageEditor
        case 'date-picker-cell':
            return DateColumnEditor
        case 'markdown':
            return MarkdownEditor
        case 'slider':
            return SliderEditor
        case 'checkbox':
            return CheckBoxEditor
        case 'rate':
            return RateEditor
        case 'select':
            return MultSelectEditor
        case 'pageLink':
            return PageLinkEditor
        default:
            return textEditor
    }
}