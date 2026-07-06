import React, { useState, useRef } from "react";
import { Editor } from "@kn/editor";
import { Button, Input, Popover, PopoverTrigger, PopoverContent } from "@kn/ui";
import { X, Folder, ImageIcon, Plus, Paperclip, FileText } from "@kn/icon";
import { useFileService, useSelector, GlobalState } from "@kn/common";
import { FieldConfig, Attachment } from "../../types";
import { generateRecordId } from "../../utils/id";
import {
    IMAGE_FALLBACK,
    IMAGE_ERROR_FALLBACK_LARGE,
    toImageUrls,
    toAttachmentArray,
} from "./shared";
import { FieldRendererProps, FieldEditorProps } from "./types";

// ---------------------------------------------------------------------------
// Image field
// ---------------------------------------------------------------------------

export const ImageRenderer: React.FC<FieldRendererProps> = ({ value, field }) => {
    const images = toImageUrls(value);
    const firstImage = images[0];

    if (!firstImage) return <div className="bitable-field-empty" />;

    const formatParts = field.format?.split(":") || ["multiple", "medium"];
    const sizeFormat = formatParts[1] || "medium";

    const getSizeClass = () => {
        switch (sizeFormat) {
            case "small":
                return "bitable-image-thumb--small";
            case "large":
                return "bitable-image-thumb--large";
            default:
                return "bitable-image-thumb--medium";
        }
    };

    return (
        <div className="bitable-image-group">
            <img
                src={firstImage}
                alt=""
                className={`bitable-image-thumb ${getSizeClass()}`}
                onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    if (img.src !== IMAGE_FALLBACK) img.src = IMAGE_FALLBACK;
                }}
            />
            {images.length > 1 && (
                <span className="bitable-attachment-count">+{images.length - 1}</span>
            )}
        </div>
    );
};

export const ImageEditor: React.FC<FieldEditorProps> = ({ value, field, onChange, onSave, editor }) => {
    const [inputUrl, setInputUrl] = useState("");
    const [showUrlInput, setShowUrlInput] = useState(false);
    const [open, setOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const fileService = useFileService();

    const formatParts = field.format?.split(":") || ["multiple", "medium"];
    const countFormat = formatParts[0] || "multiple";
    const sizeFormat = formatParts[1] || "medium";
    const allowMultiple = countFormat === "multiple";

    const getThumbnailSize = () => {
        switch (sizeFormat) {
            case "small":
                return "h-12 w-12";
            case "large":
                return "h-24 w-24";
            default:
                return "h-16 w-16";
        }
    };

    const valueToImages = (v: any): string[] => (Array.isArray(v) ? v : v ? [v] : []);
    const images: string[] = valueToImages(value);

    // Latest committed value, kept in a ref so an async file selection still
    // persists even if react-data-grid exits edit mode (unmounting this editor)
    // while the file dialog is open.
    const workingRef = useRef<any>(value);
    workingRef.current = value;

    const commit = (next: any) => {
        workingRef.current = next;
        onChange(next);
        onSave?.(next);
    };

    const addImage = (url: string) => {
        if (!url.trim()) return;
        if (!allowMultiple) {
            commit(url.trim());
            setInputUrl("");
            return;
        }
        const cur = valueToImages(workingRef.current);
        const next = [...cur, url.trim()];
        commit(next.length === 1 ? next[0] : next);
        setInputUrl("");
    };

    const removeImage = (index: number) => {
        const cur = valueToImages(workingRef.current);
        const next = cur.filter((_, i) => i !== index);
        commit(next.length === 1 ? next[0] : next.length === 0 ? null : next);
    };

    const handleSelectFromFileManager = async () => {
        if (fileService.openFileSelector && editor) {
            const selectedFiles = await fileService.openFileSelector(
                {
                    multiple: allowMultiple,
                    target: "file",
                    title: allowMultiple ? "Select Images" : "Select Image",
                },
                editor
            );

            if (selectedFiles && selectedFiles.length > 0) {
                const newImageUrls: string[] = [];

                selectedFiles.forEach((file) => {
                    let imageUrl: string | undefined;
                    if (file.url) {
                        imageUrl = file.url;
                    } else if (file.path) {
                        imageUrl = fileService.getDownloadUrl(file.path);
                    } else if (file.id) {
                        imageUrl = fileService.getDownloadUrl(file.id);
                    }
                    if (imageUrl) {
                        newImageUrls.push(imageUrl);
                    }
                });

                if (newImageUrls.length > 0) {
                    if (!allowMultiple) {
                        commit(newImageUrls[0]);
                    } else {
                        const cur = valueToImages(workingRef.current);
                        const allImages = [...cur, ...newImageUrls];
                        commit(allImages.length === 1 ? allImages[0] : allImages);
                    }
                }
            }
        } else {
            fileInputRef.current?.click();
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const dataUrl = event.target?.result as string;
                addImage(dataUrl);
            };
            reader.readAsDataURL(file);
        }
    };

    const renderTrigger = () => {
        if (images.length === 0) {
            return (
                <div className="flex items-center gap-1 text-gray-400 dark:text-gray-500">
                    <ImageIcon className="h-4 w-4" />
                    <Plus className="h-3 w-3" />
                </div>
            );
        }
        return (
            <div className="flex items-center gap-1 flex-wrap">
                {images.slice(0, 3).map((img, index) => (
                    <img
                        key={index}
                        src={img}
                        alt=""
                        className={`${getThumbnailSize()} object-cover rounded border flex-shrink-0`}
                        onError={(e) => {
                            (e.target as HTMLImageElement).src = IMAGE_ERROR_FALLBACK_LARGE;
                        }}
                    />
                ))}
                {images.length > 3 && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">+{images.length - 3}</span>
                )}
            </div>
        );
    };

    const editorContent = (
        <div className="space-y-2 w-72">
            {images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {images.map((img, index) => (
                        <div key={index} className="relative group">
                            <img
                                src={img}
                                alt=""
                                className="h-14 w-14 object-cover rounded border"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = IMAGE_ERROR_FALLBACK_LARGE;
                                }}
                            />
                            <button
                                onClick={() => removeImage(index)}
                                className="absolute -top-1.5 -right-1.5 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />

            <Button size="sm" variant="outline" onClick={handleSelectFromFileManager} className="w-full h-8 text-sm">
                <Folder className="h-4 w-4 mr-1.5 flex-shrink-0" />
                选择图片
            </Button>

            <div className="flex items-center gap-2">
                <div className="flex-1 border-t border-gray-200 dark:border-gray-600" />
                <button
                    onClick={() => setShowUrlInput(!showUrlInput)}
                    className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 whitespace-nowrap"
                >
                    {showUrlInput ? "收起" : "输入链接"}
                </button>
                <div className="flex-1 border-t border-gray-200 dark:border-gray-600" />
            </div>

            {showUrlInput && (
                <div className="flex gap-2">
                    <Input
                        value={inputUrl}
                        onChange={(e) => setInputUrl(e.target.value)}
                        placeholder="输入图片链接..."
                        className="h-8 flex-1 text-sm min-w-[120px]"
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                addImage(inputUrl);
                            }
                        }}
                    />
                    <Button size="sm" variant="outline" onClick={() => addImage(inputUrl)} disabled={!inputUrl.trim()} className="h-8 px-2">
                        添加
                    </Button>
                </div>
            )}
        </div>
    );

    const handleClose = () => {
        setOpen(false);
    };

    return (
        <Popover
            open={open}
            onOpenChange={(isOpen) => {
                setOpen(isOpen);
                if (!isOpen) {
                    handleClose();
                }
            }}
        >
            <PopoverTrigger asChild>
                <div className="w-full h-full flex items-center cursor-pointer px-1" onMouseDown={(e) => e.preventDefault()}>
                    {renderTrigger()}
                </div>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                sideOffset={4}
                className="bg-white dark:bg-card p-3 w-80"
                onOpenAutoFocus={(e) => e.preventDefault()}
            >
                {editorContent}
            </PopoverContent>
        </Popover>
    );
};

// ---------------------------------------------------------------------------
// Attachment field
// ---------------------------------------------------------------------------

export const AttachmentRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    const files = toAttachmentArray(value);
    if (files.length === 0) return <div className="bitable-field-empty" />;
    return (
        <div className="bitable-attachment-group">
            {files.slice(0, 3).map((f, i) => (
                <a
                    key={f.id || i}
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bitable-attachment-item"
                    onClick={(e) => e.stopPropagation()}
                >
                    <FileText />
                    <span>{f.name || f.url}</span>
                </a>
            ))}
            {files.length > 3 && <span className="bitable-attachment-count">+{files.length - 3}</span>}
        </div>
    );
};

export const AttachmentEditor: React.FC<FieldEditorProps> = ({ value, field, onChange, onSave, editor }) => {
    const [open, setOpen] = useState(false);
    const fileService = useFileService();
    const files = toAttachmentArray(value);
    const allowMultiple = field.format !== "single";

    const workingRef = useRef<any>(value);
    workingRef.current = value;
    const commit = (next: Attachment[]) => {
        const out = next.length === 0 ? null : next;
        workingRef.current = out;
        onChange(out);
        onSave?.(out);
    };

    const toAttachment = (file: any): Attachment | null => {
        const url =
            file.url ||
            (file.path && fileService.getDownloadUrl(file.path)) ||
            (file.id && fileService.getDownloadUrl(file.id));
        if (!url) return null;
        return {
            id: file.id || generateRecordId(),
            name: file.name || file.title || String(url).split("/").pop() || "file",
            url,
            type: file.type || file.mimeType || "",
            size: file.size || 0,
            uploadTime: new Date().toISOString(),
        };
    };

    const handleSelect = async () => {
        if (!fileService.openFileSelector || !editor) return;
        const selected = await fileService.openFileSelector(
            { multiple: allowMultiple, target: "file", title: "Select Files" },
            editor
        );
        if (!selected || selected.length === 0) return;
        const added = selected.map(toAttachment).filter((a): a is Attachment => Boolean(a));
        const cur = toAttachmentArray(workingRef.current);
        commit(allowMultiple ? [...cur, ...added] : added.slice(0, 1));
    };

    return (
        <Popover open={open} onOpenChange={(o) => setOpen(o)}>
            <PopoverTrigger asChild>
                <div className="w-full h-full flex items-center cursor-pointer px-1" onMouseDown={(e) => e.preventDefault()}>
                    {files.length > 0 ? (
                        <AttachmentRenderer value={value} field={field} />
                    ) : (
                        <span className="text-gray-400 dark:text-gray-500 inline-flex items-center gap-1">
                            <Paperclip className="h-4 w-4" />
                            <Plus className="h-3 w-3" />
                        </span>
                    )}
                </div>
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={4} className="bg-white dark:bg-card p-3 w-72" onOpenAutoFocus={(e) => e.preventDefault()}>
                <div className="space-y-2">
                    {files.length > 0 && (
                        <div className="space-y-1">
                            {files.map((f, i) => (
                                <div key={f.id || i} className="flex items-center gap-2 text-sm">
                                    <FileText className="h-4 w-4 flex-shrink-0 text-gray-500" />
                                    <span className="flex-1 truncate">{f.name}</span>
                                    <button
                                        onClick={() => commit(files.filter((_, idx) => idx !== i))}
                                        className="text-gray-400 hover:text-red-500"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <Button size="sm" variant="outline" onClick={handleSelect} className="w-full h-8 text-sm">
                        <Folder className="h-4 w-4 mr-1.5" /> Select Files
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
};
