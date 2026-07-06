/**
 * Inline expanding search bar.
 * Click search icon → input slides in. Esc or click X collapses.
 */
import React, { useState, useRef, useEffect } from "react";
import { Search, X } from "@kn/icon";
import { useTranslation } from "@kn/common";

interface SearchBarProps {
    searchText: string;
    onSearchChange: (text: string) => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({ searchText, onSearchChange }) => {
    const { t } = useTranslation();
    const [expanded, setExpanded] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus input when expanding
    useEffect(() => {
        if (expanded && inputRef.current) {
            inputRef.current.focus();
        }
    }, [expanded]);

    const handleExpand = () => {
        setExpanded(true);
    };

    const handleCollapse = () => {
        setExpanded(false);
        onSearchChange("");
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
            if (searchText) {
                onSearchChange("");
            } else {
                handleCollapse();
            }
        }
    };

    if (!expanded) {
        return (
            <button
                className="bitable-toolbar__action"
                onClick={handleExpand}
                title={t("bitable.search.placeholder") || "Search"}
            >
                <Search className="h-4 w-4" />
            </button>
        );
    }

    return (
        <div className="bitable-toolbar__search-inline">
            <Search className="bitable-toolbar__search-icon" />
            <input
                ref={inputRef}
                type="text"
                className="bitable-toolbar__search-field"
                placeholder={t("bitable.search.placeholder") || "Search..."}
                value={searchText}
                onChange={(e) => onSearchChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => {
                    if (!searchText) handleCollapse();
                }}
            />
            {searchText && (
                <button
                    className="bitable-toolbar__search-clear"
                    onClick={handleCollapse}
                >
                    <X className="h-3 w-3" />
                </button>
            )}
        </div>
    );
};
