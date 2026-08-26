import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Form,
  ScrollArea,
  useForm,
  zodResolver,
} from "@kn/ui";
import { Loader2Icon } from "@kn/icon";
import { generateText, parseMarkdownToNodes, useTranslation } from "@kn/common";
import type { Editor, JSONContent } from "@kn/editor";
import React from "react";

import {
  WizardNavigation,
  type WizardStep,
} from "./components/WizardNavigation";
import {
  createDefaultPluginSubmission,
  createPluginSubmissionSchema,
} from "./schema";
import { BasicInfoStep } from "./steps/BasicInfoStep";
import { FeaturesStep } from "./steps/FeaturesStep";
import { UploadReviewStep } from "./steps/UploadReviewStep";
import type {
  PluginDescriptionValue,
  PluginSubmissionValues,
  PluginUploaderProps,
} from "./types";
import { usePluginSubmission } from "./use-plugin-submission";

const BASIC_FIELDS: Array<keyof PluginSubmissionValues> = [
  "name",
  "pluginKey",
  "version",
  "category",
  "tags",
  "description",
];

const hasEditorContent = (content: JSONContent) => {
  if (!content || typeof content !== "object") return false;
  if (typeof content.text === "string" && content.text.trim()) return true;
  return (
    Array.isArray(content.content) && content.content.some(hasEditorContent)
  );
};

export const PluginUploader: React.FC<PluginUploaderProps> = ({
  children,
  submission,
  onSubmitted,
}) => {
  const { t } = useTranslation();
  const schema = React.useMemo(() => createPluginSubmissionSchema(t), [t]);
  const form = useForm<PluginSubmissionValues>({
    resolver: zodResolver(schema) as any,
    defaultValues: createDefaultPluginSubmission(),
    mode: "onBlur",
  });

  const [open, setOpen] = React.useState(false);
  const [showExitDialog, setShowExitDialog] = React.useState(false);
  const [currentStep, setCurrentStep] = React.useState(1);
  const [highestStep, setHighestStep] = React.useState(1);
  const [activeTagIndex, setActiveTagIndex] = React.useState<number | null>(
    null,
  );
  const [activeDescriptionId, setActiveDescriptionId] =
    React.useState("feature");
  const [stepError, setStepError] = React.useState<string>();
  const [isAiGenerating, setIsAiGenerating] = React.useState(false);
  const editorRefs = React.useRef<Record<string, Editor | null>>({});
  const featuresRef = React.useRef<HTMLDivElement>(null);
  const uploadRef = React.useRef<HTMLDivElement>(null);
  const customIdRef = React.useRef(0);
  const aiSessionRef = React.useRef(0);

  const submissionFlow = usePluginSubmission({
    form,
    submission,
    onSubmitted,
    t,
  });

  const steps: WizardStep[] = React.useMemo(
    () => [
      {
        number: 1,
        label: t("pluginUploader.steps.basicInfo"),
        description: t("pluginUploader.steps.basicInfoDesc"),
      },
      {
        number: 2,
        label: t("pluginUploader.steps.features"),
        description: t("pluginUploader.steps.featuresDesc"),
      },
      {
        number: 3,
        label: t("pluginUploader.steps.upload"),
        description: t("pluginUploader.steps.uploadDesc"),
      },
    ],
    [t],
  );

  const resetWizard = React.useCallback(() => {
    aiSessionRef.current += 1;
    submissionFlow.reset();
    const firstDescriptionId = form.getValues("versionDescs")[0]?.id ?? "feature";
    setCurrentStep(1);
    setHighestStep(1);
    setActiveDescriptionId(firstDescriptionId);
    setActiveTagIndex(null);
    setStepError(undefined);
    setIsAiGenerating(false);
    editorRefs.current = {};
  }, [form, submissionFlow.reset]);

  React.useEffect(() => {
    if (!open) return;
    resetWizard();
  }, [open, resetWizard]);

  const syncEditors = React.useCallback(() => {
    const descriptions = form.getValues("versionDescs");
    const next = descriptions.map((item) => {
      const editor = editorRefs.current[item.id];
      return editor ? { ...item, content: editor.getJSON() } : item;
    });
    form.setValue("versionDescs", next, {
      shouldDirty: true,
      shouldValidate: true,
    });
    return next;
  }, [form]);

  const validateFeatures = React.useCallback(() => {
    const descriptions = syncEditors();
    const labels = descriptions
      .map((item) => item.label.trim().toLowerCase())
      .filter(Boolean);
    if (
      labels.length !== descriptions.length ||
      new Set(labels).size !== labels.length
    ) {
      setStepError(t("pluginUploader.validation.descriptionLabels"));
      featuresRef.current?.focus();
      return false;
    }
    if (!descriptions.some((item) => hasEditorContent(item.content))) {
      setStepError(t("pluginUploader.validation.descriptionContent"));
      featuresRef.current?.focus();
      return false;
    }
    setStepError(undefined);
    return true;
  }, [syncEditors, t]);

  const validateStep = React.useCallback(
    async (step = currentStep) => {
      setStepError(undefined);
      if (step === 1) {
        const valid = await form.trigger(BASIC_FIELDS);
        if (!valid) {
          const first = BASIC_FIELDS.find(
            (field) => form.formState.errors[field],
          );
          if (first) form.setFocus(first as any);
          setStepError(t("pluginUploader.validation.formIncomplete"));
        }
        return valid;
      }
      if (step === 2) return validateFeatures();
      if (submissionFlow.isUploading) {
        setStepError(t("pluginUploader.validation.uploadInProgress"));
        uploadRef.current?.focus();
        return false;
      }
      const values = form.getValues();
      if (!values.resourcePath || !values.integrity) {
        form.setError("resourcePath", {
          message: t("pluginUploader.validation.fileRequired"),
        });
        setStepError(t("pluginUploader.validation.fileRequired"));
        uploadRef.current?.focus();
        return false;
      }
      return true;
    },
    [currentStep, form, submissionFlow.isUploading, t, validateFeatures],
  );

  const handleNext = async () => {
    if (!(await validateStep())) return;
    const next = Math.min(currentStep + 1, 3);
    setCurrentStep(next);
    setHighestStep((value) => Math.max(value, next));
  };

  const updateDescriptions = (
    updater: (items: PluginDescriptionValue[]) => PluginDescriptionValue[],
  ) => {
    const next = updater(form.getValues("versionDescs"));
    form.setValue("versionDescs", next, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const addDescription = () => {
    if (form.getValues("versionDescs").length >= 20) {
      setStepError(t("pluginUploader.validation.descriptionsMax"));
      return;
    }
    customIdRef.current += 1;
    const id = `custom-${customIdRef.current}`;
    updateDescriptions((items) => [
      ...items,
      {
        id,
        label: `${t("pluginUploader.tabs.custom")} ${customIdRef.current}`,
        content: {},
      },
    ]);
    setActiveDescriptionId(id);
  };

  const removeDescription = (id: string) => {
    updateDescriptions((items) => items.filter((item) => item.id !== id));
    if (activeDescriptionId === id) setActiveDescriptionId("feature");
    delete editorRefs.current[id];
  };

  const updateDescriptionLabel = (id: string, label: string) => {
    updateDescriptions((items) =>
      items.map((item) => (item.id === id ? { ...item, label } : item)),
    );
  };

  const handleAiGenerate = async () => {
    const values = form.getValues();
    const active = values.versionDescs.find(
      (item) => item.id === activeDescriptionId,
    );
    if (!active || !values.name) {
      setStepError(t("pluginUploader.validation.fillBasicFirst"));
      return;
    }
    const generation = ++aiSessionRef.current;
    setIsAiGenerating(true);
    try {
      const prompt = `Generate Markdown documentation for the ${active.label} section of plugin ${values.name} (${values.pluginKey}, version ${values.version}). Description: ${values.description}. Tags: ${values.tags.map((tag) => tag.text).join(", ")}. Output Markdown only.`;
      let text = "";
      const { textStream } = generateText(prompt);
      for await (const part of textStream) text += part;
      if (generation !== aiSessionRef.current || !open) return;
      const content: JSONContent = {
        type: "doc",
        content: parseMarkdownToNodes(text),
      };
      editorRefs.current[active.id]?.commands.setContent(content);
      updateDescriptions((items) =>
        items.map((item) =>
          item.id === active.id ? { ...item, content } : item,
        ),
      );
    } catch (error: any) {
      if (generation === aiSessionRef.current)
        setStepError(
          error?.message || t("pluginUploader.toast.aiGenerateFailed"),
        );
    } finally {
      if (generation === aiSessionRef.current) setIsAiGenerating(false);
    }
  };

  const closeSafely = (nextOpen: boolean) => {
    if (
      !nextOpen &&
      (form.formState.isDirty ||
        currentStep > 1 ||
        submissionFlow.isUploading ||
        isAiGenerating)
    ) {
      setShowExitDialog(true);
      return;
    }
    setOpen(nextOpen);
    if (!nextOpen) resetWizard();
  };

  const confirmExit = () => {
    setShowExitDialog(false);
    setOpen(false);
    resetWizard();
  };

  const onSubmit = form.handleSubmit(
    async (values) => {
      if (!validateFeatures() || !(await validateStep(3))) return;
      const success = await submissionFlow.submit(form.getValues());
      if (success) {
        setOpen(false);
        resetWizard();
      }
    },
    () => {
      setCurrentStep(1);
      setStepError(t("pluginUploader.validation.formIncomplete"));
    },
  );

  const activeStep = steps[currentStep - 1];

  return (
    <>
      <Dialog open={open} onOpenChange={closeSafely}>
        <DialogTrigger asChild onClick={() => setOpen(true)}>
          {children}
        </DialogTrigger>
        <DialogContent
          aria-describedby={undefined}
          className="flex h-[100dvh] max-w-full flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:h-[720px] sm:max-w-[960px] sm:rounded-xl sm:border"
        >
          <DialogHeader className="shrink-0 border-b px-4 py-4 pt-safe text-left sm:px-6">
            <DialogTitle className="text-lg">
              {submission
                ? t("pluginUploader.editTitle")
                : t("pluginUploader.dialogTitle")}
            </DialogTitle>
            <DialogDescription>
              {activeStep.label} · {activeStep.description}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="flex min-h-0 flex-1 flex-col md:flex-row">
                <WizardNavigation
                  steps={steps}
                  currentStep={currentStep}
                  highestStep={highestStep}
                  onStepClick={setCurrentStep}
                  stepLabel={t("pluginUploader.step")}
                />

                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                  <ScrollArea className="min-h-0 flex-1">
                    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-5 sm:px-6">
                      {stepError && currentStep !== 2 && (
                        <Alert variant="destructive">
                          <AlertTitle>
                            {t("pluginUploader.validation.summaryTitle")}
                          </AlertTitle>
                          <AlertDescription>{stepError}</AlertDescription>
                        </Alert>
                      )}

                      {currentStep === 1 && (
                        <BasicInfoStep
                          form={form}
                          activeTagIndex={activeTagIndex}
                          setActiveTagIndex={setActiveTagIndex}
                          iconUploading={submissionFlow.iconUploading}
                          onUploadIcon={submissionFlow.uploadIcon}
                          onRemoveIcon={submissionFlow.removeIcon}
                          resolvePath={submissionFlow.usePath}
                          t={t}
                        />
                      )}
                      {currentStep === 2 && (
                        <FeaturesStep
                          form={form}
                          activeId={activeDescriptionId}
                          onActiveIdChange={setActiveDescriptionId}
                          onAdd={addDescription}
                          onRemove={removeDescription}
                          onLabelChange={updateDescriptionLabel}
                          onAiGenerate={handleAiGenerate}
                          isAiGenerating={isAiGenerating}
                          editorRefs={editorRefs}
                          focusRef={featuresRef}
                          error={stepError}
                          t={t}
                        />
                      )}
                      {currentStep === 3 && (
                        <UploadReviewStep
                          form={form}
                          attachments={submissionFlow.attachments}
                          onFilesChange={submissionFlow.setArtifactFiles}
                          onUpload={submissionFlow.uploadArtifact}
                          isUploading={submissionFlow.isUploading}
                          uploadError={submissionFlow.uploadError || submissionFlow.submitError}
                          focusRef={uploadRef}
                          resolvePath={submissionFlow.usePath}
                          t={t}
                        />
                      )}
                    </div>
                  </ScrollArea>

                  <DialogFooter className="shrink-0 flex-row gap-2 border-t bg-background px-4 py-3 pb-safe sm:px-6 sm:py-4">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-11 flex-1 sm:flex-none"
                      onClick={() =>
                        setCurrentStep((step) => Math.max(1, step - 1))
                      }
                      disabled={currentStep === 1}
                    >
                      {t("pluginUploader.buttons.prev")}
                    </Button>
                    {currentStep < 3 ? (
                      <Button
                        type="button"
                        className="h-11 flex-1 sm:flex-none sm:min-w-28"
                        onClick={handleNext}
                      >
                        {t("pluginUploader.buttons.next")}
                      </Button>
                    ) : (
                      <Button
                        type="submit"
                        className="h-11 flex-1 sm:flex-none sm:min-w-36"
                        disabled={
                          submissionFlow.isSubmitting ||
                          submissionFlow.isUploading ||
                          submissionFlow.iconUploading ||
                          isAiGenerating
                        }
                      >
                        {submissionFlow.isSubmitting && (
                          <Loader2Icon className="mr-2 size-4 animate-spin" />
                        )}
                        {submissionFlow.isSubmitting
                          ? t("pluginUploader.buttons.submitting")
                          : t("pluginUploader.buttons.submitForReview")}
                      </Button>
                    )}
                  </DialogFooter>
                </div>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("pluginUploader.exitDialog.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("pluginUploader.exitDialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("pluginUploader.exitDialog.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmExit}>
              {t("pluginUploader.exitDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
