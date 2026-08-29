import { useTranslation } from "@kn/common";
import { EditorRender } from "@kn/editor";
import { AlertCircleIcon, FileTextIcon } from "@kn/icon";
import { Card, Empty, Tabs, TabsContent, TabsList, TabsTrigger } from "@kn/ui";
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
      <Card className="overflow-hidden border-border/70 shadow-none">
        <div className="border-b border-border/60 px-5 py-4 md:px-6">
          <h2 className="text-base font-semibold">
            {t("pluginHub.detail.documentation")}
          </h2>
        </div>
        <Empty
          className="min-h-72 px-6"
          icon={<FileTextIcon className="size-6" />}
          title={t("pluginHub.detail.docsEmpty")}
          desc={t("pluginHub.detail.docsEmptyDesc")}
        />
      </Card>
    );
  }

  return (
    <Card className="min-w-0 overflow-hidden border-border/70 shadow-none">
      <Tabs value={activeSection.id} onValueChange={setActiveSectionId}>
        <div className="border-b border-border/60 bg-card">
          <div className="px-5 pt-4 md:px-6">
            <h2 className="text-base font-semibold">
              {t("pluginHub.detail.documentation")}
            </h2>
          </div>
          <div className="mt-2 overflow-x-auto px-3 md:px-4">
            <TabsList className="h-auto min-w-max border-0 bg-transparent p-0">
              {sections.map((section) => (
                <TabsTrigger
                  key={section.id}
                  value={section.id}
                  className="h-11 rounded-none border-b-2 border-transparent px-3 text-sm text-muted-foreground shadow-none transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none lg:h-10"
                >
                  {section.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>

        <TabsContent
          value={activeSection.id}
          className="m-0 min-h-[420px] focus-visible:outline-none"
        >
          {activeSection.malformed || !activeSection.content ? (
            <div className="flex min-h-72 items-center justify-center p-6">
              <div className="max-w-md rounded-xl border border-destructive/20 bg-destructive/5 p-5 text-center">
                <AlertCircleIcon className="mx-auto size-6 text-destructive" />
                <h3 className="mt-3 text-sm font-semibold">
                  {t("pluginHub.detail.docsMalformed")}
                </h3>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
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
            />
          )}
        </TabsContent>
      </Tabs>
    </Card>
  );
};
