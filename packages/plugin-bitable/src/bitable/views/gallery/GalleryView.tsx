import React, { useMemo, useState, useCallback } from "react";
import { ImageIcon, Plus, ChevronRight, ChevronDown } from "@kn/icon";
import { useTranslation } from "@kn/common";
import { FieldConfig, RecordData, ViewConfig, FieldType } from "../../../types";
import { applyGroups, getGroupLabel } from "../../../utils/dataProcessing";
import { GalleryToolbar } from "./GalleryToolbar";
import { GalleryGrid } from "./GalleryGrid";

interface GalleryViewProps {
    view: ViewConfig;
    fields: FieldConfig[];
    data: RecordData[];
    editable: boolean;
    onUpdateView: (viewId: string, updates: Partial<ViewConfig>) => void;
    onAddRecord?: () => void;
    onRecordClick?: (record: RecordData) => void;
    onUpdateRecord?: (recordId: string, updates: Partial<RecordData>) => void;
}

export const GalleryView: React.FC<GalleryViewProps> = (props) => {
    const {
        view,
        fields,
        data,
        editable,
        onUpdateView,
        onAddRecord,
        onRecordClick,
    } = props;
    const { t } = useTranslation();

    const galleryConfig = view.galleryConfig;
    const cardSize = galleryConfig?.cardSize || "medium";
    const fitType = galleryConfig?.fitType || "cover";
    const coverFieldId = galleryConfig?.coverField;

    // Find cover field
    const coverField = coverFieldId
        ? fields.find((f) => f.id === coverFieldId)
        : fields.find((f) => f.type === FieldType.IMAGE);

    // Find title field (first text field that's not the cover)
    const titleField = fields.find(
        (f) =>
            f.type === FieldType.TEXT &&
            f.id !== coverField?.id &&
            f.isShow !== false
    );

    // Candidate display fields (exclude cover, title, system, image)
    const candidateFields = fields.filter(
        (f) =>
            f.isShow !== false &&
            f.id !== coverField?.id &&
            f.id !== titleField?.id &&
            f.type !== FieldType.ID &&
            f.type !== FieldType.AUTO_NUMBER &&
            f.type !== FieldType.IMAGE
    );

    // Get display fields from config or first 3 candidates
    const displayFields = useMemo(() => {
        const ids = galleryConfig?.displayFields;
        if (ids && ids.length > 0) {
            const byId = new Map(candidateFields.map((f) => [f.id, f]));
            return ids.map((id) => byId.get(id)).filter((f): f is FieldConfig => !!f);
        }
        return candidateFields.slice(0, 3);
    }, [candidateFields, galleryConfig?.displayFields]);

    // Group support
    const groupField = view.groups?.length
        ? fields.find((f) => f.id === view.groups![0]!.fieldId)
        : undefined;
    const groupedData = useMemo(() => {
        if (!view.groups?.length) return undefined;
        return applyGroups(data, view.groups, fields);
    }, [data, view.groups, fields]);

    // Collapsed groups state
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
    const toggleGroup = useCallback((key: string) => {
        setCollapsedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    }, []);

    // Can reorder only when no sort is active
    const canReorder = !view.sorts || view.sorts.length === 0;

    // Handle reorder (update record order)
    const handleReorder = useCallback(
        (sourceId: string, targetId: string) => {
            // For now, we don't persist reorder - the record `order` field would need updating
            // This is a UI-level reorder that could be persisted via onUpdateRecord
            // For a minimal implementation, we skip actual data mutation
        },
        []
    );

    // Empty state
    if (data.length === 0) {
        return (
            <>
                <GalleryToolbar
                    view={view}
                    fields={fields}
                    editable={editable}
                    onUpdateView={onUpdateView}
                />
                <div className="bitable-gallery__empty">
                    <ImageIcon style={{ width: 48, height: 48 }} />
                    <p className="bitable-gallery__empty-text">
                        {t("bitable.galleryView.noData")}
                    </p>
                    {editable && onAddRecord && (
                        <button
                            className="bitable-gallery__empty-add"
                            onClick={onAddRecord}
                        >
                            <Plus style={{ width: 14, height: 14 }} />
                            {t("bitable.galleryView.addRecord")}
                        </button>
                    )}
                </div>
            </>
        );
    }

    const renderGrid = (records: RecordData[]) => (
        <GalleryGrid
            records={records}
            coverField={coverField}
            titleField={titleField}
            displayFields={displayFields}
            fitType={fitType}
            cardSize={cardSize}
            canReorder={canReorder}
            onRecordClick={onRecordClick}
            onReorder={handleReorder}
        />
    );

    return (
        <>
            <GalleryToolbar
                view={view}
                fields={fields}
                editable={editable}
                onUpdateView={onUpdateView}
            />
            <div className="bitable-gallery">
                {groupedData
                    ? Array.from(groupedData.entries()).map(([key, records]) => (
                          <div key={key || "__empty__"} className="bitable-gallery__group">
                              <div
                                  className="bitable-gallery__group-header"
                                  onClick={() => toggleGroup(key)}
                              >
                                  {collapsedGroups.has(key) ? (
                                      <ChevronRight style={{ width: 14, height: 14 }} />
                                  ) : (
                                      <ChevronDown style={{ width: 14, height: 14 }} />
                                  )}
                                  <span className="bitable-gallery__group-label">
                                      {getGroupLabel(key, groupField)}
                                  </span>
                                  <span className="bitable-gallery__group-count">
                                      ({records.length})
                                  </span>
                              </div>
                              {!collapsedGroups.has(key) && renderGrid(records)}
                          </div>
                      ))
                    : renderGrid(data)}
            </div>
        </>
    );
};
