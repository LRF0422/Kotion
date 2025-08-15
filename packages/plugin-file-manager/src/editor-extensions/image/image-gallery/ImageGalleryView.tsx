import { useUploadFile } from "@kn/core";
import { NodeViewProps, NodeViewWrapper } from "@kn/editor";
import { IconPlus } from "@kn/icon";
import { Button, CarouselGallery, FileUploader, GalleryImage } from "@kn/ui";
import React, { useState } from "react";


export const ImageGalleryView: React.FC<NodeViewProps> = (props) => {
    const images: GalleryImage[] = props.node.attrs.images || [];
    const [files, setFiles] = useState<File[]>([])
    const { uploadFile, usePath, upload } = useUploadFile()
    return <NodeViewWrapper>
        {
            images.length > 0 ? <CarouselGallery images={images} onClickAdd={() => {
                upload().then(res => {
                    props.updateAttributes({ images: [...images, { src: usePath(res.name), alt: res.originalName }] })
                })
            }} /> :
                <FileUploader
                    multiple
                    maxFileCount={10}
                    value={files}
                    onValueChange={(files) => setFiles(files)}
                    onUpload={(files) => {
                        return Promise.all(files.map(it => {
                            return uploadFile(it).then(res => {
                                return {
                                    src: usePath(res.name),
                                    alt: res.originalName,
                                }
                            })
                        })).then(res => {
                            props.updateAttributes({
                                images: res
                            })
                        })
                    }}
                />
        }
    </NodeViewWrapper>
}