import * as React from "react"
import { Cross2Icon, FileTextIcon, UploadIcon } from "@radix-ui/react-icons"
import Dropzone, {
  type DropzoneProps,
  type FileRejection,
} from "react-dropzone"
import { toast } from "sonner"

import { cn, formatBytes } from "@ui/lib/utils"
import { useControllableState } from "@ui/hooks/use-controllable-state"
import { Button } from "@ui/components/ui/button"
import { Progress } from "@ui/components/ui/progress"
import { ScrollArea } from "@ui/components/ui/scroll-area"

export interface FileUploaderMessages {
  maxSingleFile?: string
  maxFiles?: (count: number) => string
  rejected?: (fileName: string, message?: string) => string
  dropActive?: string
  dropIdle?: string
  uploadHint?: (maxFileCount: number, maxSize: number) => string
  uploading?: (target: string) => string
  uploaded?: (target: string) => string
  uploadFailed?: (target: string) => string
  removeFile?: string
}

interface FileUploaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Value of the uploader.
   * @type File[]
   * @default undefined
   * @example value={files}
   */
  value?: File[]

  /**
   * Function to be called when the value changes.
   * @type (files: File[]) => void
   * @default undefined
   * @example onValueChange={(files) => setFiles(files)}
   */
  onValueChange?: (files: File[]) => void

  /**
   * Function to be called when files are uploaded.
   * @type (files: File[]) => Promise<void>
   * @default undefined
   * @example onUpload={(files) => uploadFiles(files)}
   */
  onUpload?: (files: File[]) => Promise<void>

  /**
   * Progress of the uploaded files.
   * @type Record<string, number> | undefined
   * @default undefined
   * @example progresses={{ "file1.png": 50 }}
   */
  progresses?: Record<string, number>

  /**
   * Accepted file types for the uploader.
   * @type { [key: string]: string[]}
   * @default
   * ```ts
   * { "image/*": [] }
   * ```
   * @example accept={["image/png", "image/jpeg"]}
   */
  accept?: DropzoneProps["accept"]

  /**
   * Maximum file size for the uploader.
   * @type number | undefined
   * @default 1024 * 1024 * 2 // 2MB
   * @example maxSize={1024 * 1024 * 2} // 2MB
   */
  maxSize?: DropzoneProps["maxSize"]

  /**
   * Maximum number of files for the uploader.
   * @type number | undefined
   * @default 1
   * @example maxFileCount={4}
   */
  maxFileCount?: DropzoneProps["maxFiles"]

  /**
   * Whether the uploader should accept multiple files.
   * @type boolean
   * @default false
   * @example multiple
   */
  multiple?: boolean

  /**
   * Whether the uploader is disabled.
   * @type boolean
   * @default false
   * @example disabled
   */
  disabled?: boolean

  /** Whether FileUploader should display its own upload toast.promise. */
  showUploadToast?: boolean

  /** Localized copy used by the dropzone, rejections, upload status, and remove action. */
  messages?: FileUploaderMessages

  /** Called when the parent wants to render upload failures inline. */
  onUploadError?: (error: unknown) => void

  /** Called with the complete rejected-file list. */
  onFileReject?: (rejections: FileRejection[]) => void
}

export function FileUploader(props: FileUploaderProps) {
  const {
    value: valueProp,
    onValueChange,
    onUpload,
    progresses,
    accept = {
      "image/*": [],
    },
    maxSize = 1024 * 1024 * 2,
    maxFileCount = 1,
    multiple = false,
    disabled = false,
    showUploadToast = true,
    messages,
    onUploadError,
    onFileReject,
    className,
    ...dropzoneProps
  } = props

  const [files, setFiles] = useControllableState({
    prop: valueProp,
    onChange: onValueChange,
  })

  const onDrop = React.useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      if (!multiple && maxFileCount === 1 && acceptedFiles.length > 1) {
        toast.error(messages?.maxSingleFile ?? "Cannot upload more than 1 file at a time")
        return
      }

      if ((files?.length ?? 0) + acceptedFiles.length > maxFileCount) {
        toast.error(messages?.maxFiles?.(maxFileCount) ?? `Cannot upload more than ${maxFileCount} files`)
        return
      }

      const updatedFiles = files ? [...files, ...acceptedFiles] : acceptedFiles

      if (acceptedFiles.length > 0) setFiles(updatedFiles)

      if (rejectedFiles.length > 0) {
        onFileReject?.(rejectedFiles)
        rejectedFiles.forEach(({ file, errors }) => {
          if (errors && errors.length > 0) {
            toast.error(
              messages?.rejected?.(file.name, errors[0]?.message)
                ?? `File ${file.name} was rejected, message: ${errors[0]?.message}`
            )
          }
        })
      }

      if (
        acceptedFiles.length > 0 &&
        onUpload &&
        updatedFiles.length > 0 &&
        updatedFiles.length <= maxFileCount
      ) {
        const target =
          updatedFiles.length > 0 ? `${updatedFiles.length} files` : `file`

        const uploadPromise = onUpload(updatedFiles)
          .catch((error) => {
            onUploadError?.(error)
            throw error
          })

        if (showUploadToast) {
          toast.promise(uploadPromise, {
            loading: messages?.uploading?.(target) ?? `Uploading ${target}...`,
            success: messages?.uploaded?.(target) ?? `${target} uploaded`,
            error: messages?.uploadFailed?.(target) ?? `Failed to upload ${target}`,
          })
        } else {
          void uploadPromise.catch(() => undefined)
        }
      }
    },

    [files, maxFileCount, messages, multiple, onFileReject, onUpload, onUploadError, setFiles, showUploadToast]
  )

  function onRemove(index: number) {
    if (!files) return
    const newFiles = files.filter((_, i) => i !== index)
    setFiles(newFiles)
  }

  const isDisabled = disabled || (files?.length ?? 0) >= maxFileCount

  return (
    <div className="relative flex flex-col gap-6 overflow-hidden">
      <Dropzone
        onDrop={onDrop}
        accept={accept}
        maxSize={maxSize}
        maxFiles={maxFileCount}
        multiple={maxFileCount > 1 || multiple}
        disabled={isDisabled}
      >
        {({ getRootProps, getInputProps, isDragActive }) => (
          <div
            {...getRootProps()}
            className={cn(
              "group relative grid h-52 w-full cursor-pointer place-items-center rounded-lg border-2 border-dashed border-muted-foreground/25 px-5 py-2.5 text-center transition hover:bg-muted/25",
              "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              isDragActive && "border-muted-foreground/50",
              isDisabled && "pointer-events-none opacity-60",
              className
            )}
            {...dropzoneProps}
          >
            <input {...getInputProps()} />
            {isDragActive ? (
              <div className="flex flex-col items-center justify-center gap-4 sm:px-5">
                <div className="rounded-full border border-dashed p-3">
                  <UploadIcon
                    className="size-7 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
                <p className="font-medium text-muted-foreground">
                  {messages?.dropActive ?? "Drop the files here"}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 sm:px-5">
                <div className="rounded-full border border-dashed p-3">
                  <UploadIcon
                    className="size-7 text-muted-foreground"
                    aria-hidden="true"
                  />
                </div>
                <div className="flex flex-col gap-px">
                  <p className="font-medium text-muted-foreground">
                    {messages?.dropIdle ?? "Drag 'n' drop files here, or click to select files"}
                  </p>
                  <p className="text-sm text-muted-foreground/70">
                    {messages?.uploadHint?.(maxFileCount, maxSize)
                      ?? (maxFileCount > 1
                        ? `You can upload ${maxFileCount === Infinity ? "multiple" : maxFileCount} files (up to ${formatBytes(maxSize)} each)`
                        : `You can upload a file with ${formatBytes(maxSize)}`)}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </Dropzone>
      {files?.length ? (
        <ScrollArea className="h-fit w-full px-3">
          <div className="flex max-h-48 flex-col gap-4">
            {files?.map((file, index) => (
              <FileCard
                key={index}
                file={file}
                onRemove={() => onRemove(index)}
                progress={progresses?.[file.name]}
                removeLabel={messages?.removeFile}
              />
            ))}
          </div>
        </ScrollArea>
      ) : null}
    </div>
  )
}

interface FileCardProps {
  file: File
  onRemove: () => void
  progress?: number
  removeLabel?: string
}

function FileCard({ file, progress, onRemove, removeLabel }: FileCardProps) {
  return (
    <div className="relative flex items-center gap-2.5">
      <div className="flex flex-1 gap-2.5">
        {/* {isFileWithPreview(file) ? <FilePreview file={file} /> : null} */}
        <div className="flex w-full flex-col gap-2">
          <div className="flex flex-col gap-px">
            <p className="line-clamp-1 text-sm font-medium text-foreground/80">
              {file.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatBytes(file.size)}
            </p>
          </div>
          {progress !== undefined ? <Progress value={progress} /> : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          onClick={onRemove}
        >
          <Cross2Icon className="size-4" aria-hidden="true" />
          <span className="sr-only">{removeLabel ?? "Remove file"}</span>
        </Button>
      </div>
    </div>
  )
}

function isFileWithPreview(file: File): file is File & { preview: string } {
  return "preview" in file && typeof file.preview === "string"
}

interface FilePreviewProps {
  file: File & { preview: string }
}

function FilePreview({ file }: FilePreviewProps) {
  if (file.type.startsWith("image/")) {
    return (
      <img
        src={file.preview}
        alt={file.name}
        width={48}
        height={48}
        loading="lazy"
        className="aspect-square shrink-0 rounded-md object-cover"
      />
    )
  }

  return (
    <FileTextIcon
      className="size-10 text-muted-foreground"
      aria-hidden="true"
    />
  )
}