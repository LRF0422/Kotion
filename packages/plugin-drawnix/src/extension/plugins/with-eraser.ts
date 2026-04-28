import {
    PlaitBoard,
    PlaitPlugin,
    Transforms,
    toViewBoxPoint,
    toHostPoint,
    PlaitPointerType,
    getHitElementByPoint,
} from '@plait/core';

export const ERASER_TYPE = 'eraser';

/**
 * Eraser plugin: when pointer is 'eraser', clicking on an element
 * removes it from the board.
 */
export const withEraser: PlaitPlugin = (board: PlaitBoard) => {
    const { pointerDown } = board;

    board.pointerDown = (event: PointerEvent) => {
        const pointer = PlaitBoard.getPointer<string>(board);
        if (pointer !== ERASER_TYPE) {
            pointerDown(event);
            return;
        }

        // Find the element at the click position
        const viewPoint = toViewBoxPoint(board, toHostPoint(board, event.x, event.y));
        const hitElement = getHitElementByPoint(board, viewPoint as [number, number]) || null;

        if (hitElement) {
            // Find the element's path and remove it
            const path = PlaitBoard.findPath(board, hitElement);
            if (path) {
                Transforms.removeNode(board, path);
            }
        }
    };

    return board;
};

