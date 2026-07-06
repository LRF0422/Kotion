import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

export interface ContextMenuItem {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    danger?: boolean;
    disabled?: boolean;
}

export interface ContextMenuSeparator {
    separator: true;
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator;

interface ContextMenuProps {
    items: ContextMenuEntry[];
    children: React.ReactNode;
    /** If provided, the menu opens on right-click of this element. */
    onContextMenu?: (e: React.MouseEvent) => boolean | void;
}

/**
 * Reusable right-click context menu component.
 * Wraps children and shows a context menu on right-click.
 * Uses portal to avoid clipping by overflow:hidden containers.
 */
export const ContextMenu: React.FC<ContextMenuProps> = ({ items, children, onContextMenu }) => {
    const [visible, setVisible] = useState(false);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const menuRef = useRef<HTMLDivElement>(null);

    const handleContextMenu = useCallback(
        (e: React.MouseEvent) => {
            // Allow consumer to suppress
            if (onContextMenu) {
                const result = onContextMenu(e);
                if (result === false) return;
            }
            e.preventDefault();
            setPos({ x: e.clientX, y: e.clientY });
            setVisible(true);
        },
        [onContextMenu]
    );

    const handleClose = useCallback(() => setVisible(false), []);

    useEffect(() => {
        if (!visible) return;
        const handleClick = () => handleClose();
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") handleClose();
        };
        document.addEventListener("pointerdown", handleClick);
        document.addEventListener("keydown", handleEsc);
        return () => {
            document.removeEventListener("pointerdown", handleClick);
            document.removeEventListener("keydown", handleEsc);
        };
    }, [visible, handleClose]);

    return (
        <>
            <div onContextMenu={handleContextMenu} style={{ display: "contents" }}>
                {children}
            </div>
            {visible &&
                createPortal(
                    <div
                        ref={menuRef}
                        className="bitable-context-menu"
                        style={{ top: pos.y, left: pos.x }}
                    >
                        {items.map((item, idx) => {
                            if ("separator" in item) {
                                return (
                                    <div
                                        key={`sep-${idx}`}
                                        className="bitable-context-menu__separator"
                                    />
                                );
                            }
                            return (
                                <button
                                    key={`item-${idx}`}
                                    className={`bitable-context-menu__item${
                                        item.danger ? " bitable-context-menu__item--danger" : ""
                                    }`}
                                    disabled={item.disabled}
                                    onClick={() => {
                                        item.onClick();
                                        handleClose();
                                    }}
                                >
                                    {item.icon}
                                    <span>{item.label}</span>
                                </button>
                            );
                        })}
                    </div>,
                    document.body
                )}
        </>
    );
};
