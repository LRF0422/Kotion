import {
    PlaitBoard,
    PlaitPlugin,
    Point,
    Transforms,
    toViewBoxPoint,
    toHostPoint,
    distanceBetweenPointAndPoint,
    PlaitPointerType,
} from '@plait/core';
import { isDrawingMode } from '@plait/common';
import { FreehandGenerator, PlaitFreehand, createFreehandElement, FREEHAND_TYPE } from './with-freehand';

/**
 * Plugin for interactively creating freehand strokes.
 * When pointer is 'freehand' and board is in drawing mode,
 * dragging creates a freehand element with smooth point collection.
 */
export const withFreehandCreate: PlaitPlugin = (board: PlaitBoard) => {
    const { pointerDown, pointerMove, pointerUp, globalPointerUp } = board;

    let isDrawing = false;
    let points: Point[] = [];
    let temporaryElement: PlaitFreehand | null = null;
    let generator: FreehandGenerator | null = null;

    // Minimum distance between consecutive points (in board coordinates)
    const MIN_POINT_DISTANCE = 3;

    /**
     * The board's DOM host is registered asynchronously by react-board after
     * the SVG element mounts. Calling toHostPoint / processDrawing before that
     * (or after unmount) blows up inside @plait/core because it dereferences
     * `host.getBoundingClientRect()`. Only the SVG host is required for pointer
     * math; `getElementTopHost` may be legitimately absent on a fresh board and
     * is guarded separately where used (see processDrawing call site).
     */
    const isBoardAlive = (): boolean => {
        return !!PlaitBoard.getHost(board);
    };

    const resetState = () => {
        try {
            generator?.destroy();
        } catch {
            // ignore - host may already be gone
        }
        generator = null;
        temporaryElement = null;
        isDrawing = false;
        points = [];
    };

    const complete = (cancel?: boolean) => {
        if (isDrawing && temporaryElement && !cancel && points.length >= 2 && isBoardAlive()) {
            try {
                Transforms.insertNode(board, temporaryElement, [board.children.length]);
            } catch {
                // swallow - board state may have changed
            }
        }
        resetState();
    };

    board.pointerDown = (event: PointerEvent) => {
        const pointer = PlaitBoard.getPointer<string>(board);
        if (pointer === FREEHAND_TYPE && isDrawingMode(board) && isBoardAlive()) {
            try {
                const viewPoint = toViewBoxPoint(board, toHostPoint(board, event.x, event.y));
                isDrawing = true;
                points = [viewPoint];
                temporaryElement = createFreehandElement([...points]);
                generator = new FreehandGenerator(board);
            } catch {
                resetState();
            }
        }
        // Only forward to downstream plugins when the board host is mounted;
        // otherwise they'll dereference an undefined host element and crash
        // inside @plait/core (host.getBoundingClientRect()).
        if (isBoardAlive()) {
            pointerDown(event);
        }
    };

    board.pointerMove = (event: PointerEvent) => {
        if (isDrawing) {
            if (!isBoardAlive()) {
                // Board died mid-stroke - silently bail
                resetState();
                return;
            }
            try {
                const viewPoint = toViewBoxPoint(board, toHostPoint(board, event.x, event.y));

                // Only add point if it's far enough from the last one (reduces noise)
                const lastPoint = points[points.length - 1];
                const dist = distanceBetweenPointAndPoint(
                    lastPoint[0], lastPoint[1], viewPoint[0], viewPoint[1]
                );
                if (dist < MIN_POINT_DISTANCE) return;

                points.push(viewPoint);

                // Update the temporary element and re-render
                // Destroy the old generator's DOM node, then create a fresh one
                generator?.destroy();
                generator = new FreehandGenerator(board);
                temporaryElement = createFreehandElement([...points]);
                const topHost = PlaitBoard.getElementTopHost(board);
                if (topHost) {
                    generator.processDrawing(temporaryElement, topHost);
                }
            } catch {
                resetState();
            }
            return;
        }
        // Defer to downstream plugins only when the board is alive,
        // otherwise they'll dereference an undefined host element.
        if (isBoardAlive()) {
            pointerMove(event);
        }
    };

    board.pointerUp = (event: PointerEvent) => {
        if (isDrawing) {
            complete();
        }
        if (isBoardAlive()) {
            pointerUp(event);
        }
    };

    board.globalPointerUp = (event: PointerEvent) => {
        if (isDrawing) {
            // Cancel the in-flight stroke instead of trying to commit it -
            // pointerup outside the board frame is unreliable for committing.
            complete(true);
        }
        if (isBoardAlive()) {
            globalPointerUp(event);
        }
    };

    return board;
};
