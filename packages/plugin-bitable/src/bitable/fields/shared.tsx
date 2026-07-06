import React from "react";
import { useTranslation } from "@kn/common";
import { zhCN, enUS } from "date-fns/locale";
import { X } from "@kn/icon";
import { Person, Attachment } from "../../types";

/** Pick the date-fns locale matching the current i18n language. */
export const useDateLocale = () => {
    const { i18n } = useTranslation();
    return i18n.language?.startsWith("zh") ? zhCN : enUS;
};

/**
 * Inline SVG shown when an image URL fails to load, so the cell doesn't
 * collapse to blank (which would look like an empty field).
 */
export const IMAGE_FALLBACK =
    'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect fill="%23f0f0f0" width="40" height="40"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23999" font-size="8">?</text></svg>';

/** Larger variant used inside the Image editor popover. */
export const IMAGE_ERROR_FALLBACK_LARGE =
    'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><rect fill="%23f0f0f0" width="56" height="56"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%23999" font-size="8">Error</text></svg>';

/**
 * Normalize a stored image value into a list of URL strings. Values may be a
 * plain URL string, an array of strings, or objects ({ url } / { src } /
 * { path }) produced by some import / file-manager paths.
 */
export const toImageUrls = (value: any): string[] => {
    const items = Array.isArray(value) ? value : [value];
    return items
        .map((item: any) => {
            if (!item) return "";
            if (typeof item === "string") return item;
            if (typeof item === "object") return item.url || item.src || item.path || "";
            return "";
        })
        .filter(Boolean);
};

/** Normalize a stored person value into an array of Person objects. */
export const toPersonArray = (value: any): Person[] => {
    if (!value) return [];
    return (Array.isArray(value) ? value : [value]).filter(
        (p: any): p is Person => p && typeof p === "object" && (p.name || p.id)
    );
};

/** Normalize a stored attachment value into an array of Attachment objects. */
export const toAttachmentArray = (value: any): Attachment[] => {
    if (!value) return [];
    return (Array.isArray(value) ? value : [value]).filter(
        (a: any): a is Attachment => a && typeof a === "object" && a.url
    );
};

/** Small avatar chip used in both PersonRenderer and PersonEditor. */
export const PersonChip: React.FC<{ person: Person; onRemove?: () => void }> = ({
    person,
    onRemove,
}) => (
    <span className="bitable-person-chip">
        {person.avatar ? (
            <img src={person.avatar} alt="" className="bitable-person-chip__avatar" />
        ) : (
            <span className="bitable-person-chip__avatar-fallback">
                {(person.name || "?").slice(0, 1).toUpperCase()}
            </span>
        )}
        <span className="bitable-person-chip__name">{person.name}</span>
        {onRemove && (
            <button onClick={onRemove} className="bitable-person-chip__remove">
                <X />
            </button>
        )}
    </span>
);
