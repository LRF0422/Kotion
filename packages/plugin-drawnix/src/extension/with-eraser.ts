import { PlaitBoard, PlaitElement, PlaitPlugin, Point, Transforms } from '@plait/core';

/**
 * Custom eraser plugin for Plait board.
 * When the pointer is set to 'eraser', clicking on an element will delete it.
 * This works by intercepting pointerDown events and removing hit elements.
 */
export const withEraser: PlaitPlugin = (board: PlaitBoard) => {
    const { pointerDown, pointerMove, pointerUp } = board;

    board.pointerDown = (event: PointerEvent) => {
        // Check if eraser mode is active
        const pointer = PlaitBoard.getPointer<string>(board);
        if (pointer !== 'eraser') {
            pointerDown.call(board, event);
            return;
        }

        // Get the click point in board coordinates
        const point = getPointFromEvent(board, event);
        if (!point) {
            pointerDown.call(board, event);
            return;
        }

        // Find the top-most element at this point
        const hitElement = findHitElement(board, point);
        if (hitElement) {
            // Remove the element
            deleteElement(board, hitElement);
            // Prevent further processing
            return;
        }

        // No element hit, pass through
        pointerDown.call(board, event);
    };

    board.pointerMove = (event: PointerEvent) => {
        const pointer = PlaitBoard.getPointer<string>(board);
        if (pointer !== 'eraser') {
            pointerMove.call(board, event);
            return;
        }
        // In eraser mode, we could highlight elements on hover
        // For now, just skip the default move behavior
    };

    board.pointerUp = (event: PointerEvent) => {
        const pointer = PlaitBoard.getPointer<string>(board);
        if (pointer !== 'eraser') {
            pointerUp.call(board, event);
            return;
        }
    };

    return board;
};

/**
 * Get the board-space point from a pointer event
 */
function getPointFromEvent(board: PlaitBoard, event: PointerEvent): Point | null {
    const container = PlaitBoard.getBoardContainer(board);
    if (!container) return null;

    const rect = container.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Convert screen coordinates to board coordinates using viewport
    const viewport = board.viewport;
    if (!viewport) return [x, y];

    const boardX = (x - viewport.offsetX) / viewport.zoom;
    const boardY = (y - viewport.offsetY) / viewport.zoom;

    return [boardX, boardY];
}

/**
 * Find the top-most element at the given point
 */
function findHitElement(board: PlaitBoard, point: Point): PlaitElement | null {
    // Iterate children in reverse (top-most first)
    for (let i = board.children.length - 1; i >= 0; i--) {
        const element = board.children[i];
        if (board.isHit(element, point)) {
            return element;
        }
    }
    return null;
}

/**
 * Delete an element from the board
 */
function deleteElement(board: PlaitBoard, element: PlaitElement): void {
    const index = board.children.indexOf(element as any);
    if (index !== -1) {
        Transforms.removeNode(board, [index]);
    }
}
