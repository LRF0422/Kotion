/**
 * Add view menu — dropdown with view type icons.
 * Opens when the "+" button at the end of view tabs is clicked.
 */
import React from "react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@kn/ui";
import { Plus } from "@kn/icon";
import { useTranslation } from "@kn/common";
import { ViewType } from "../../../types";
import { getViewIcon } from "../../fields/fieldIcons";

interface AddViewMenuProps {
    onAddView: (type: ViewType) => void;
}

const VIEW_TYPES: ViewType[] = [
    ViewType.TABLE,
    ViewType.KANBAN,
    ViewType.GALLERY,
    ViewType.TIMELINE,
    ViewType.CALENDAR,
    ViewType.CHART,
    ViewType.FORM,
];

export const AddViewMenu: React.FC<AddViewMenuProps> = ({ onAddView }) => {
    const { t } = useTranslation();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    className="bitable-toolbar__action bitable-toolbar__add-view"
                    title={t("bitable.actions.addView")}
                >
                    <Plus className="h-4 w-4" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
                <DropdownMenuLabel>{t("bitable.actions.addView")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {VIEW_TYPES.map((type) => (
                    <DropdownMenuItem key={type} onClick={() => onAddView(type)}>
                        {getViewIcon(type)}
                        <span className="ml-2">
                            {t(`bitable.views.${type}`) || type}
                        </span>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
