/**
 * Page-edit-window bridge — the draggable floating page editor.
 *
 * The implementation lives in @kn/core (which owns the editor stack and is
 * never imported by plugins) and registers itself here at startup, mirroring
 * the OffscreenEditorBridge pattern. Consumers simply render the
 * `PageEditWindow` component exported below — it forwards to the registered
 * implementation, or renders nothing (with an error log) if the app shell
 * hasn't registered one.
 */

import React from "react";
import { logger } from "../utils/logger";

export interface PageEditWindowProps {
    /** Page to open in the floating editor window. */
    pageId: string;
    onClose: () => void;
}

let impl: React.ComponentType<PageEditWindowProps> | null = null;

/** Called once by @kn/core at application startup; not for application code. */
export const setPageEditWindowImpl = (component: React.ComponentType<PageEditWindowProps>): void => {
    impl = component;
};

/**
 * Draggable floating window for editing a page in place — drag by the header,
 * resize from the corner, minimize to a pill docked bottom-right, multiple
 * windows cascade and click-to-focus. Edits sync live through the page's
 * collaborative Y.Doc room and auto-save through the incremental PATCH
 * endpoint.
 */
export const PageEditWindow: React.FC<PageEditWindowProps> = (props) => {
    if (!impl) {
        logger.error("[PageEditWindow] no implementation registered — @kn/core must call setPageEditWindowImpl at startup");
        return null;
    }
    const Impl = impl;
    return <Impl {...props} />;
};
