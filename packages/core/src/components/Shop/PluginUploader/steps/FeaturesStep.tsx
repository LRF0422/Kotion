import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type UseFormReturn,
} from "@kn/ui";
import { Loader2Icon, PlusIcon, Sparkles, TrashIcon } from "@kn/icon";
import { CollaborationEditor, type Editor } from "@kn/editor";
import React, { type MutableRefObject, type RefObject } from "react";

import type { PluginSubmissionValues } from "../types";

interface FeaturesStepProps {
  form: UseFormReturn<PluginSubmissionValues>;
  activeId: string;
  onActiveIdChange: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onLabelChange: (id: string, label: string) => void;
  onAiGenerate: () => void;
  isAiGenerating: boolean;
  editorRefs: MutableRefObject<Record<string, Editor | null>>;
  focusRef: RefObject<HTMLDivElement>;
  error?: string;
  t: (key: string) => string;
}

export const FeaturesStep = ({
  form,
  activeId,
  onActiveIdChange,
  onAdd,
  onRemove,
  onLabelChange,
  onAiGenerate,
  isAiGenerating,
  editorRefs,
  focusRef,
  error,
  t,
}: FeaturesStepProps) => {
  const descriptions = form.watch("versionDescs");
  const active =
    descriptions.find((item) => item.id === activeId) ?? descriptions[0];

  return (
    <div ref={focusRef} tabIndex={-1} className="space-y-4 outline-none">
      {error && (
        <Alert variant="destructive">
          <AlertTitle>
            {t("pluginUploader.validation.featuresTitle")}
          </AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-xl border bg-muted/20 p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base">
            💡
          </div>
          <div>
            <p className="text-sm font-medium">
              {t("pluginUploader.docTip.title")}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {t("pluginUploader.docTip.content")}
            </p>
          </div>
        </div>
      </div>

      <Tabs value={active?.id} onValueChange={onActiveIdChange}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 overflow-x-auto pb-1">
            <TabsList className="h-11 w-max justify-start">
              {descriptions.map((item) => (
                <TabsTrigger
                  key={item.id}
                  value={item.id}
                  className="min-h-11 gap-2 px-3"
                >
                  <span className="max-w-32 truncate">
                    {t(`pluginUploader.tabs.${item.id}`) ===
                    `pluginUploader.tabs.${item.id}`
                      ? item.label
                      : t(`pluginUploader.tabs.${item.id}`)}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={onAiGenerate}
              disabled={isAiGenerating}
            >
              {isAiGenerating ? (
                <Loader2Icon className="mr-2 size-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 size-4 text-purple-500" />
              )}
              {isAiGenerating
                ? t("pluginUploader.buttons.aiGenerating")
                : t("pluginUploader.buttons.aiGenerate")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11"
              onClick={onAdd}
            >
              <PlusIcon className="mr-2 size-4" />
              {t("pluginUploader.buttons.addSection")}
            </Button>
          </div>
        </div>

        {active && !active.canonical && (
          <div className="mt-3 flex items-center gap-2">
            <Input
              value={active.label}
              onChange={(event) => onLabelChange(active.id, event.target.value)}
              className="h-11 max-w-sm"
              placeholder={t("pluginUploader.tabs.customPlaceholder")}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 text-destructive"
              onClick={() => onRemove(active.id)}
            >
              <TrashIcon className="size-4" />
              <span className="sr-only">
                {t("pluginUploader.buttons.removeSection")}
              </span>
            </Button>
          </div>
        )}

        <div className="mt-3 overflow-hidden rounded-xl border bg-background">
          {descriptions.map((item, index) => (
            <TabsContent key={item.id} value={item.id} className="m-0">
              <CollaborationEditor
                ref={(editor: Editor | null) => {
                  editorRefs.current[item.id] = editor;
                }}
                id=""
                content={item.content}
                isEditable
                synced
                width="w-full"
                withTitle={false}
                toc={false}
                toolbar
                user={null}
                token=""
                className="min-h-[320px] max-h-[460px] prose-sm"
                onBlur={(editor) => {
                  const next = [...form.getValues("versionDescs")];
                  next[index] = { ...next[index], content: editor.getJSON() };
                  form.setValue("versionDescs", next, {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                }}
              />
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  );
};
