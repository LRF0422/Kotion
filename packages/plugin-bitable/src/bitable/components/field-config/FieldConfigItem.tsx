/**
 * Single field config row with react-dnd drag/drop for reordering.
 * Replaces the react-beautiful-dnd Draggable component.
 *
 * Features:
 * - 18x18px drag handle (visible on hover)
 * - Visibility toggle (Eye/EyeOff)
 * - Click to open FieldPropertyForm popover
 * - Drop indicator line between items
 */
import React, { useRef } from "react";
import { useDrag, useDrop } from "react-dnd";
import { cn } from "@kn/ui";
import { Button } from "@kn/ui";
import { GripVertical, Eye, EyeOff, ChevronRight } from "@kn/icon";
import { useTranslation } from "@kn/common";
import { FieldConfig, FieldType, SelectOption } from "../../../types";
import { getFieldTypeIcon } from "../../fields/fieldIcons";
import { FieldPropertyForm } from "./FieldPropertyForm";

export const FIELD_CONFIG_ITEM_TYPE = "field-config-item";

interface DragItem {
    index: number;
    id: string;
}

interface FieldConfigItemProps {
    field: FieldConfig;
    index: number;
    onUpdateField: (fieldId: string, updates: Partial<FieldConfig>) => void;
    onDeleteField: (fieldId: string) => void;
    onConvertFieldType?: (fieldId: string, newType: FieldType, newOptions?: SelectOption[]) => void;
    onReorder: (dragIndex: number, hoverIndex: number) => void;
}

export const FieldConfigItem: React.FC<FieldConfigItemProps> = ({
    field,
    index,
    onUpdateField,
    onDeleteField,
    onConvertFieldType,
    onReorder,
}) => {
    const { t } = useTranslation();
    const ref = useRef<HTMLDivElement>(null);

    const isLocked = field.type === FieldType.ID;

    const [{ isDragging }, drag, preview] = useDrag<
        DragItem,
        void,
        { isDragging: boolean }
    >(() => ({
        type: FIELD_CONFIG_ITEM_TYPE,
        item: { index, id: field.id },
        canDrag: () => !isLocked,
        collect: (monitor) => ({
            isDragging: monitor.isDragging(),
        }),
    }), [index, field.id, isLocked]);

    const [{ isOver, dragIndex }, drop] = useDrop<
        DragItem,
        void,
        { isOver: boolean; dragIndex: number | null }
    >(() => ({
        accept: FIELD_CONFIG_ITEM_TYPE,
        hover: (item: DragItem, monitor) => {
            if (!ref.current) return;
            const dragIndexVal = item.index;
            const hoverIndexVal = index;
            if (dragIndexVal === hoverIndexVal) return;
            const hoverRect = ref.current.getBoundingClientRect();
            const hoverMiddleY = (hoverRect.bottom - hoverRect.top) / 2;
            const clientOffset = monitor.getClientOffset();
            if (!clientOffset) return;
            const hoverClientY = clientOffset.y - hoverRect.top;
            if (dragIndexVal < hoverIndexVal && hoverClientY < hoverMiddleY) return;
            if (dragIndexVal > hoverIndexVal && hoverClientY > hoverMiddleY) return;
            onReorder(dragIndexVal, hoverIndexVal);
            item.index = hoverIndexVal;
        },
        collect: (monitor) => ({
            isOver: monitor.isOver(),
            dragIndex: monitor.getItem<DragItem>()?.index ?? null,
        }),
    }), [index, onReorder]);

    // Attach both drag and drop to the same ref
    drag(drop(preview(ref)));

    const showDropIndicatorAbove = isOver && dragIndex !== null && dragIndex < index;
    const showDropIndicatorBelow = isOver && dragIndex !== null && dragIndex > index;

    return (
        <div ref={ref} className="bitable-field-config__item-wrapper">
            {showDropIndicatorAbove && (
                <div className="bitable-field-config__drop-indicator" />
            )}
            <div
                className={cn(
                    "bitable-field-config__item",
                    isDragging && "bitable-field-config__item--dragging",
                    isLocked && "bitable-field-config__item--locked"
                )}
            >
                {/* Drag handle — 18x18px, visible on hover */}
                <div
                    className={cn(
                        "bitable-field-config__drag-handle",
                        isLocked && "bitable-field-config__drag-handle--disabled"
                    )}
                >
                    <GripVertical className="h-4 w-4" />
                </div>

                {/* Visibility toggle */}
                <Button
                    size="sm"
                    variant="ghost"
                    className="bitable-field-config__visibility-toggle"
                    onClick={() => onUpdateField(field.id, { isShow: !field.isShow })}
                    disabled={isLocked}
                >
                    {field.isShow ? (
                        <Eye className="h-3.5 w-3.5" />
                    ) : (
                        <EyeOff className="h-3.5 w-3.5" />
                    )}
                </Button>

                {/* Field info — click to open property form */}
                {isLocked ? (
                    <div className="bitable-field-config__item-info bitable-field-config__item-info--locked">
                        <div>
                            <div className="font-medium text-sm truncate">{field.title}</div>
                            <div className="text-xs text-muted-foreground">
                                {t(`bitable.fieldTypes.${field.type}`) || field.type}
                            </div>
                        </div>
                    </div>
                ) : (
                    <FieldPropertyForm
                        field={field}
                        onUpdateField={(updates) => onUpdateField(field.id, updates)}
                        onDeleteField={() => onDeleteField(field.id)}
                        onConvertFieldType={
                            onConvertFieldType
                                ? (newType, newOptions) =>
                                      onConvertFieldType(field.id, newType, newOptions)
                                : undefined
                        }
                    >
                        <div className="bitable-field-config__item-info">
                            <div className="flex items-center gap-2">
                                <span className="text-muted-foreground">
                                    {getFieldTypeIcon(field.type)}
                                </span>
                                <div>
                                    <div className="font-medium text-sm truncate">
                                        {field.title}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {t(`bitable.fieldTypes.${field.type}`) || field.type}
                                    </div>
                                </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                    </FieldPropertyForm>
                )}
            </div>
            {showDropIndicatorBelow && (
                <div className="bitable-field-config__drop-indicator" />
            )}
        </div>
    );
};
