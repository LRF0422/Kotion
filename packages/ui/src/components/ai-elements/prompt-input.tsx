/**
 * AI Elements — Prompt Input
 *
 * Adapted from shadcn/ui AI Elements for this repository. The upstream
 * component builds on the shadcn `InputGroup`; the chat composer already owns
 * its card surface, so this version keeps the same composable API
 * (`PromptInput` / `Body` / `Textarea` / `Footer` / `Tools` / `Submit`) and
 * renders directly into that card.
 *
 * Adapter notes:
 *  - no `ai` / `nanoid` dependency: payloads are plain `File[]` and ids use
 *    `crypto.randomUUID()` with a fallback;
 *  - attachment state is kept local to the form (the composer manages its own
 *    image previews, but the primitive is usable standalone);
 *  - `value` / `onValueChange` are optional so the form can be controlled by a
 *    host composer or run entirely self-managed.
 */

import React, {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEventHandler,
  type ComponentProps,
  type FormEvent,
  type HTMLAttributes,
  type KeyboardEventHandler,
  type ReactNode,
  type RefObject,
} from "react";

import {
  CornerDownLeft,
  ImagePlus,
  Loader2,
  Paperclip,
  Square,
  X,
} from "@kn/icon";

import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { cn } from "../../lib/utils";

export type PromptInputFile = {
  id: string;
  file: File;
  url: string;
  filename: string;
  mediaType: string;
};

export type PromptInputMessage = {
  text: string;
  files: File[];
};

type PromptInputContextValue = {
  text: string;
  setText: (value: string) => void;
  clear: () => void;
  files: PromptInputFile[];
  addFiles: (files: File[] | FileList) => void;
  removeFile: (id: string) => void;
  openFileDialog: () => void;
  fileInputRef: RefObject<HTMLInputElement>;
};

const PromptInputContext = createContext<PromptInputContextValue | null>(null);

const usePromptInput = () => {
  const context = useContext(PromptInputContext);
  if (!context) {
    throw new Error("PromptInput components must be used within PromptInput");
  }
  return context;
};

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `file-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
};

export type PromptInputProps = Omit<HTMLAttributes<HTMLFormElement>, "onSubmit"> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onSubmit: (
    message: PromptInputMessage,
    event: FormEvent<HTMLFormElement>,
  ) => void | Promise<void>;
  accept?: string;
  multiple?: boolean;
  maxFiles?: number;
  maxFileSize?: number;
  onError?: (error: {
    code: "max_files" | "max_file_size" | "accept";
    message: string;
  }) => void;
};

export const PromptInput = ({
  className,
  value,
  defaultValue = "",
  onValueChange,
  onSubmit,
  accept,
  multiple = true,
  maxFiles,
  maxFileSize,
  onError,
  children,
  ...props
}: PromptInputProps) => {
  const [internalText, setInternalText] = useState(defaultValue);
  const text = value ?? internalText;
  const [files, setFiles] = useState<PromptInputFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef(files);
  filesRef.current = files;

  const setText = useCallback(
    (next: string) => {
      if (value === undefined) setInternalText(next);
      onValueChange?.(next);
    },
    [value, onValueChange],
  );

  const clear = useCallback(() => {
    if (value === undefined) setInternalText("");
    onValueChange?.("");
  }, [value, onValueChange]);

  const matchesAccept = useCallback(
    (file: File) => {
      if (!accept || accept.trim() === "") return true;
      return accept
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .some((pattern) => {
          if (pattern.endsWith("/*")) {
            return file.type.startsWith(pattern.slice(0, -1));
          }
          return file.type === pattern;
        });
    },
    [accept],
  );

  const addFiles = useCallback(
    (incoming: File[] | FileList) => {
      const list = Array.from(incoming);
      if (list.length === 0) return;

      const accepted = list.filter(matchesAccept);
      if (accepted.length === 0) {
        onError?.({ code: "accept", message: "No files match the accepted types." });
        return;
      }

      const sized = maxFileSize ? accepted.filter((file) => file.size <= maxFileSize) : accepted;
      if (sized.length === 0) {
        onError?.({ code: "max_file_size", message: "All files exceed the maximum size." });
        return;
      }

      setFiles((prev) => {
        const capacity = typeof maxFiles === "number" ? Math.max(0, maxFiles - prev.length) : undefined;
        const capped = typeof capacity === "number" ? sized.slice(0, capacity) : sized;
        if (typeof capacity === "number" && sized.length > capacity) {
          onError?.({ code: "max_files", message: "Too many files. Some were not added." });
        }
        return prev.concat(
          capped.map((file) => ({
            id: createId(),
            file,
            url: URL.createObjectURL(file),
            filename: file.name,
            mediaType: file.type,
          })),
        );
      });
    },
    [matchesAccept, maxFileSize, maxFiles, onError],
  );

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const found = prev.find((file) => file.id === id);
      if (found?.url) URL.revokeObjectURL(found.url);
      return prev.filter((file) => file.id !== id);
    });
  }, []);

  const openFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Release blob URLs on unmount.
  useEffect(
    () => () => {
      for (const file of filesRef.current) {
        if (file.url) URL.revokeObjectURL(file.url);
      }
    },
    [],
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onSubmit({ text, files: files.map((item) => item.file) }, event);
  };

  const contextValue = useMemo<PromptInputContextValue>(
    () => ({
      text,
      setText,
      clear,
      files,
      addFiles,
      removeFile,
      openFileDialog,
      fileInputRef,
    }),
    [text, setText, clear, files, addFiles, removeFile, openFileDialog],
  );

  return (
    <PromptInputContext.Provider value={contextValue}>
      <input
        ref={fileInputRef}
        accept={accept}
        className="sr-only"
        multiple={multiple}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          if (event.target.files) addFiles(event.target.files);
          event.target.value = "";
        }}
        tabIndex={-1}
        type="file"
      />
      <form
        className={cn("w-full", className)}
        onSubmit={handleSubmit}
        data-slot="prompt-input"
        {...props}
      >
        {children}
      </form>
    </PromptInputContext.Provider>
  );
};

export type PromptInputBodyProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputBody = ({ className, ...props }: PromptInputBodyProps) => (
  <div className={cn("contents", className)} {...props} />
);

export type PromptInputTextareaProps = ComponentProps<"textarea">;

export const PromptInputTextarea = forwardRef<HTMLTextAreaElement, PromptInputTextareaProps>(
  (
    {
      onChange,
      onKeyDown,
      onPaste,
      className,
      placeholder = "What would you like to know?",
      ...props
    },
    ref,
  ) => {
    const context = useContext(PromptInputContext);
    const [isComposing, setIsComposing] = useState(false);

    const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (event) => {
      onKeyDown?.(event);
      if (event.defaultPrevented) return;

      if (event.key === "Enter") {
        if (isComposing || event.nativeEvent.isComposing) return;
        if (event.shiftKey) return;
        event.preventDefault();

        const form = event.currentTarget.form;
        const submitButton = form?.querySelector(
          'button[type="submit"]',
        ) as HTMLButtonElement | null;
        if (submitButton?.disabled) return;
        form?.requestSubmit();
      }
    };

    const handlePaste: ClipboardEventHandler<HTMLTextAreaElement> = (event) => {
      onPaste?.(event);
      if (event.defaultPrevented) return;
      const items = event.clipboardData?.items;
      if (!items) return;

      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }

      if (files.length > 0) {
        event.preventDefault();
        context?.addFiles(files);
      }
    };

    return (
      <Textarea
        ref={ref}
        name="message"
        onCompositionEnd={() => setIsComposing(false)}
        onCompositionStart={() => setIsComposing(true)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={placeholder}
        {...props}
        value={context ? context.text : props.value}
        onChange={(event) => {
          context?.setText(event.target.value);
          onChange?.(event);
        }}
        className={cn("field-sizing-content max-h-48 min-h-16", className)}
      />
    );
  },
);

PromptInputTextarea.displayName = "PromptInputTextarea";

export type PromptInputHeaderProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputHeader = ({ className, ...props }: PromptInputHeaderProps) => (
  <div
    className={cn("order-first flex flex-wrap items-center gap-1", className)}
    data-slot="prompt-input-header"
    {...props}
  />
);

export type PromptInputFooterProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputFooter = ({ className, ...props }: PromptInputFooterProps) => (
  <div
    className={cn("flex items-center justify-between gap-1", className)}
    data-slot="prompt-input-footer"
    {...props}
  />
);

export type PromptInputToolsProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputTools = ({ className, ...props }: PromptInputToolsProps) => (
  <div className={cn("flex items-center gap-1", className)} {...props} />
);

export type PromptInputButtonProps = ComponentProps<typeof Button>;

export const PromptInputButton = forwardRef<HTMLButtonElement, PromptInputButtonProps>(
  function PromptInputButton({ variant = "ghost", className, size, ...props }, ref) {
    return (
      <Button
        ref={ref}
        className={cn(className)}
        size={size ?? "icon-sm"}
        type="button"
        variant={variant}
        {...props}
      />
    );
  },
);

export type PromptInputSubmitProps = ComponentProps<typeof Button> & {
  status?: "ready" | "submitted" | "streaming" | "error";
};

export const PromptInputSubmit = forwardRef<HTMLButtonElement, PromptInputSubmitProps>(
  function PromptInputSubmit(
    { className, variant = "default", size = "icon-sm", status, children, ...props },
    ref,
  ) {
    let icon: ReactNode = <CornerDownLeft className="size-4" />;

    if (status === "submitted") {
      icon = <Loader2 className="size-4 animate-spin" />;
    } else if (status === "streaming") {
      icon = <Square className="size-4" />;
    } else if (status === "error") {
      icon = <X className="size-4" />;
    }

    return (
      <Button
        ref={ref}
        aria-label="Submit"
        className={cn(className)}
        size={size}
        type="submit"
        variant={variant}
        {...props}
      >
        {children ?? icon}
      </Button>
    );
  },
);

export type PromptInputActionAddAttachmentsProps = ComponentProps<typeof Button> & {
  label?: string;
};

export const PromptInputActionAddAttachments = ({
  label = "Add photos or files",
  className,
  children,
  ...props
}: PromptInputActionAddAttachmentsProps) => {
  const context = usePromptInput();

  return (
    <Button
      className={cn(className)}
      onClick={context.openFileDialog}
      size="icon-sm"
      type="button"
      variant="ghost"
      aria-label={label}
      {...props}
    >
      {children ?? <ImagePlus className="size-4" />}
      <span className="sr-only">{label}</span>
    </Button>
  );
};

export type PromptInputAttachmentsProps = HTMLAttributes<HTMLDivElement>;

export const PromptInputAttachments = ({
  className,
  children,
  ...props
}: PromptInputAttachmentsProps) => {
  const context = usePromptInput();

  return (
    <div className={cn("flex flex-wrap items-start gap-2", className)} {...props}>
      {children}
      {context.files.map((file) => (
        <PromptInputAttachment
          key={file.id}
          data={file}
          onRemove={() => context.removeFile(file.id)}
        />
      ))}
    </div>
  );
};

export type PromptInputAttachmentProps = HTMLAttributes<HTMLDivElement> & {
  data: PromptInputFile;
  onRemove?: () => void;
};

export const PromptInputAttachment = ({
  data,
  onRemove,
  className,
  ...props
}: PromptInputAttachmentProps) => {
  const isImage = data.mediaType.startsWith("image/");

  return (
    <div
      className={cn(
        "group/attachment relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border bg-muted",
        className,
      )}
      {...props}
    >
      {isImage ? (
        <img alt={data.filename} className="size-full object-cover" src={data.url} />
      ) : (
        <div className="flex flex-col items-center gap-1 text-muted-foreground">
          <Paperclip className="size-4" />
          <span className="max-w-[56px] truncate text-[10px]">{data.filename}</span>
        </div>
      )}
      {onRemove && (
        <button
          type="button"
          aria-label="Remove attachment"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 backdrop-blur-sm transition-opacity hover:bg-background group-hover/attachment:opacity-100"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
};