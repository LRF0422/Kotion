import { useTranslation } from "@kn/common";
import { EditorRender } from "@kn/editor";
import { AlertCircleIcon, FileTextIcon } from "@kn/icon";
import { Empty, Tabs, TabsContent, TabsList, TabsTrigger, cn } from "@kn/ui";
import React, { useEffect, useMemo, useState } from "react";
import { NormalizedDocumentationSection } from "../plugin-model";

interface PluginDocumentationCardProps {
  pluginId: string;
  versionId?: string;
  sections: NormalizedDocumentationSection[];
}

export const PluginDocumentationCard: React.FC<
  PluginDocumentationCardProps
> = ({ pluginId, versionId, sections }) => {
  const { t } = useTranslation();
  const sectionIds = useMemo(
    () => sections.map((section) => section.id).join("|"),
    [sections],
  );
  const [activeSectionId, setActiveSectionId] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    setActiveSectionId(sections[0]?.id ?? "");
  }, [pluginId, versionId, sectionIds]);

  const activeSection =
    sections.find((section) => section.id === activeSectionId) ?? sections[0];

  if (!activeSection) {
    return (
      <div className="min-w-0">
        <div className="border-b border-border/60 pb-2">
          <h2 className="text-sm font-semibold">
            {t("pluginHub.detail.documentation")}
          </h2>
        </div>
        <Empty
          className="min-h-64"
          icon={<FileTextIcon className="size-5" />}
          title={t("pluginHub.detail.docsEmpty")}
          desc={t("pluginHub.detail.docsEmptyDesc")}
        />
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <Tabs value={activeSection.id} onValueChange={setActiveSectionId}>
        <div className="border-b border-border/60">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <h2 className="pb-2 text-sm font-semibold">
              {t("pluginHub.detail.documentation")}
            </h2>
            <div className="-ml-3 overflow-x-auto">
              <TabsList className="h-auto min-w-max border-0 bg-transparent p-0">
                {sections.map((section) => (
                  <TabsTrigger
                    key={section.id}
                    value={section.id}
                    className="h-9 rounded-none border-b-2 border-transparent px-3 text-[13px] text-muted-foreground shadow-none transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  >
                    {section.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </div>
        </div>

        <TabsContent
          value={activeSection.id}
          className="m-0 min-h-[240px] pt-4 focus-visible:outline-none"
        >
          {activeSection.malformed || !activeSection.content ? (
            <div className="flex min-h-64 items-center justify-center py-8">
              <div className="max-w-md border-l-2 border-destructive/40 pl-4">
                <AlertCircleIcon className="size-5 text-destructive" />
                <h3 className="mt-2 text-sm font-medium">
                  {t("pluginHub.detail.docsMalformed")}
                </h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {t("pluginHub.detail.docsMalformedDesc")}
                </p>
              </div>
            </div>
          ) : (
            <EditorRender
              key={`${pluginId}-${versionId ?? "current"}-${activeSection.id}`}
              content={activeSection.content}
              user={null}
              id={`plugin-detail-${pluginId}-${activeSection.id}`}
              toc={false}
              toolbar={false}
              isEditable={false}
              width="w-full"
              withTitle={false}
              // 只读文档：去掉编辑器的 900px 阅读列与 40px 内缩，让正文与
              // 页签左对齐；标题字号收到与页面层级匹配的大小。
              className={cn(
                "[&_.kn-editor]:!max-w-none [&_.kn-editor]:!px-0 [&_.kn-editor]:!pb-6",
                "[&_.kn-editor_h1]:!mb-3 [&_.kn-editor_h1]:!mt-1 [&_.kn-editor_h1]:!text-xl",
                "[&_.kn-editor_h2]:!mt-5 [&_.kn-editor_h2]:!text-base",
                "[&_.kn-editor_h3]:!text-sm",
              )}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
