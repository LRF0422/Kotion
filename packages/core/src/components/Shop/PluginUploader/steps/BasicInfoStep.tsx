import {
  Button,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TagInput,
  Textarea,
  type UseFormReturn,
} from "@kn/ui";
import { ImageIcon, Loader2Icon, TrashIcon, UploadIcon } from "@kn/icon";
import React, { type ReactNode } from "react";

import type { PluginSubmissionValues } from "../types";

interface BasicInfoStepProps {
  form: UseFormReturn<PluginSubmissionValues>;
  activeTagIndex: number | null;
  setActiveTagIndex: React.Dispatch<React.SetStateAction<number | null>>;
  iconUploading: boolean;
  onUploadIcon: () => void;
  onRemoveIcon: () => void;
  resolvePath: (path: string) => string;
  t: (key: string) => string;
}

const Section = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section className="rounded-xl border bg-card">
    <div className="border-b px-4 py-3 sm:px-5">
      <h3 className="text-sm font-semibold">{title}</h3>
    </div>
    <div className="p-4 sm:p-5">{children}</div>
  </section>
);

export const BasicInfoStep = ({
  form,
  activeTagIndex,
  setActiveTagIndex,
  iconUploading,
  onUploadIcon,
  onRemoveIcon,
  resolvePath,
  t,
}: BasicInfoStepProps) => {
  const iconPath = form.watch("icon");
  const description = form.watch("description");

  return (
    <div className="space-y-4">
      <Section title={t("pluginUploader.sections.basicIdentity")}>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("pluginUploader.fields.pluginName")}</FormLabel>
                <FormControl>
                  <Input
                    className="h-11"
                    placeholder={t(
                      "pluginUploader.fields.pluginNamePlaceholder",
                    )}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t("pluginUploader.fields.pluginNameHint")}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="pluginKey"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("pluginUploader.fields.pluginKey")}</FormLabel>
                <FormControl>
                  <Input
                    className="h-11 font-mono"
                    placeholder={t(
                      "pluginUploader.fields.pluginKeyPlaceholder",
                    )}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t("pluginUploader.fields.pluginKeyHint")}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </Section>

      <Section title={t("pluginUploader.sections.versionAndCategory")}>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="version"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("pluginUploader.fields.version")}</FormLabel>
                <FormControl>
                  <Input
                    className="h-11 font-mono"
                    placeholder="1.0.0"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t("pluginUploader.fields.versionHint")}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("pluginUploader.fields.category")}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger className="h-11">
                      <SelectValue
                        placeholder={t(
                          "pluginUploader.fields.categoryPlaceholder",
                        )}
                      />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="FEATURE">
                      {t("pluginUploader.categories.feature")}
                    </SelectItem>
                    <SelectItem value="APP">
                      {t("pluginUploader.categories.app")}
                    </SelectItem>
                    <SelectItem value="CONNECTOR">
                      {t("pluginUploader.categories.connector")}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  {t("pluginUploader.fields.categoryHint")}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="tags"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>{t("pluginUploader.fields.tags")}</FormLabel>
                <FormControl>
                  <TagInput
                    tags={field.value}
                    setTags={field.onChange}
                    activeTagIndex={activeTagIndex}
                    setActiveTagIndex={setActiveTagIndex}
                    maxTags={5}
                    placeholder={t("pluginUploader.fields.tagsPlaceholder")}
                  />
                </FormControl>
                <FormDescription>
                  {t("pluginUploader.fields.tagsHint")}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </Section>

      <Section title={t("pluginUploader.sections.displayInfo")}>
        <div className="grid gap-5 md:grid-cols-[160px_minmax(0,1fr)]">
          <FormField
            control={form.control}
            name="icon"
            render={() => (
              <FormItem>
                <FormLabel>{t("pluginUploader.fields.icon")}</FormLabel>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={iconPath ? undefined : onUploadIcon}
                    disabled={iconUploading}
                    className="group relative flex size-28 min-h-11 min-w-11 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed bg-muted/20 transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                    aria-label={
                      iconPath
                        ? t("pluginUploader.fields.iconPreview")
                        : t("pluginUploader.fields.iconUpload")
                    }
                  >
                    {iconUploading ? (
                      <Loader2Icon className="size-6 animate-spin" />
                    ) : iconPath ? (
                      <img
                        src={resolvePath(iconPath)}
                        alt={t("pluginUploader.fields.iconPreview")}
                        className="size-full object-cover"
                      />
                    ) : (
                      <span className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
                        <ImageIcon className="size-7" />
                        {t("pluginUploader.fields.iconUpload")}
                      </span>
                    )}
                  </button>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-11 flex-1"
                      onClick={onUploadIcon}
                      disabled={iconUploading}
                    >
                      <UploadIcon className="mr-1 size-4" />
                      {iconPath
                        ? t("pluginUploader.buttons.replace")
                        : t("pluginUploader.buttons.upload")}
                    </Button>
                    {iconPath && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-11 text-destructive"
                        onClick={onRemoveIcon}
                      >
                        <TrashIcon className="size-4" />
                        <span className="sr-only">
                          {t("pluginUploader.buttons.remove")}
                        </span>
                      </Button>
                    )}
                  </div>
                </div>
                <FormDescription>
                  {t("pluginUploader.fields.iconHint")}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between gap-3">
                  <FormLabel>
                    {t("pluginUploader.fields.description")}
                  </FormLabel>
                  <span className="text-xs text-muted-foreground">
                    {description.length}/500
                  </span>
                </div>
                <FormControl>
                  <Textarea
                    rows={6}
                    className="min-h-32 resize-none"
                    placeholder={t(
                      "pluginUploader.fields.descriptionPlaceholder",
                    )}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t("pluginUploader.fields.descriptionHint")}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </Section>
    </div>
  );
};
