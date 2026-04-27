import {
    PlaitBoard,
    PlaitElement,
    PlaitPlugin,
    Point,
    Transforms,
} from '@plait/core';
import { nanoid } from 'nanoid';

/**
 * Freehand drawing element type.
 * Stores an array of points representing a hand-drawn stroke.
 */
export interface PlaitFreehand extends PlaitElement {
    type: 'freehand';
    points: Point[];
    strokeColor?: string;
    strokeWidth?: number;
}

export const FREEHAND_TYPE = 'freehand';

export const Freehand = {
    isFreehand: (value: any): value is PlaitFreehand => {
        return value?.type === FREEHAND_TYPE;
    }
};

/**
 * Custom freehand drawing plugin for Plait board.
 * When the pointer is set to 'freehand', dragging on the canvas
 * creates a freehand stroke by collecting pointer points.
 */
export const withFreehand: PlaitPlugin = (board: PlaitBoard) => {
    const { pointerDown, pointerMove, pointerUp } = board;

    let isDrawing = false;
    let currentPoints: Point[] = [];
    let currentElementId: string | null = null;

    board.pointerDown = (event: PointerEvent) => {
        const pointer = PlaitBoard.getPointer<string>(board);
        if (pointer !== 'freehand') {
            pointerDown.call(board, event);
            return;
        }

        // Get the point in board coordinates
        const point = getPointFromEvent(board, event);
        if (!point) {
            pointerDown.call(board, event);
            return;
        }

        isDrawing = true;
        currentPoints = [point];
        currentElementId = nanoid(6);

        // Insert initial freehand element with single point
        const freehandElement: PlaitFreehand = {
            id: currentElementId,
            type: FREEHAND_TYPE,
            points: [point],
            strokeColor: '#333333',
            strokeWidth: 2,
        };

        Transforms.insertNode(board, freehandElement, [board.children.length]);
    };

    board.pointerMove = (event: PointerEvent) => {
        const pointer = PlaitBoard.getPointer<string>(board);
        if (pointer !== 'freehand' || !isDrawing) {
            pointerMove.call(board, event);
            return;
        }

        const point = getPointFromEvent(board, event);
        if (!point) return;

        // Simplify: only add point if it's far enough from the last one
        const lastPoint = currentPoints[currentPoints.length - 1];
        const distance = Math.sqrt(
            Math.pow(point[0] - lastPoint[0], 2) + Math.pow(point[1] - lastPoint[1], 2)
        );

        if (distance < 3) return; // Skip if too close

        currentPoints.push(point);

        // Update the existing freehand element with new points
        if (currentElementId) {
            const index = board.children.findIndex((child: any) => child.id === currentElementId);
            if (index !== -1) {
                Transforms.setNode(board, { points: [...currentPoints] }, [index]);
            }
        }
    };

    board.pointerUp = (event: PointerEvent) => {
        const pointer = PlaitBoard.getPointer<string>(board);
        if (pointer !== 'freehand' || !isDrawing) {
            pointerUp.call(board, event);
            return;
        }

        isDrawing = false;

        // If only one point was drawn, remove the element (too small)
        if (currentPoints.length < 2 && currentElementId) {
            const index = board.children.findIndex((child: any) => child.id === currentElementId);
            if (index !== -1) {
                Transforms.removeNode(board, [index]);
            }
        }

        currentPoints = [];
        currentElementId = null;
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
