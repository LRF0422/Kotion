import { PlaitBoard, PlaitElement, PlaitPlugin, Point, Transforms, PlaitPointerType, RectangleClient, ACTIVE_STROKE_WIDTH } from '@plait/core';
import { Generator, CommonElementFlavour, ActiveGenerator, createActiveGenerator, hasResizeHandle } from '@plait/common';

// ============================================================
// Data Type
// ============================================================

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

export function createFreehandElement(points: Point[], strokeColor?: string, strokeWidth?: number): PlaitFreehand {
    return {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        type: FREEHAND_TYPE,
        points,
        strokeColor: strokeColor || '#333333',
        strokeWidth: strokeWidth || 2,
    };
}

// ============================================================
// Generator - Renders freehand strokes as SVG using rough.js
// ============================================================

export class FreehandGenerator extends Generator<PlaitFreehand> {
    protected draw(element: PlaitFreehand): SVGGElement | undefined {
        if (element.points.length < 2) return undefined;

        const roughSVG = PlaitBoard.getRoughSVG(this.board);
        const options = {
            strokeWidth: element.strokeWidth || 2,
            stroke: element.strokeColor || '#333333',
            roughness: 0.5,
            bowing: 1,
        };

        // Use rough.js curve for smooth freehand rendering
        const g = roughSVG.curve(element.points, options);

        // Set round line caps for smooth strokes
        const paths = g.querySelectorAll('path');
        paths.forEach(path => {
            path.setAttribute('stroke-linecap', 'round');
            path.setAttribute('stroke-linejoin', 'round');
        });

        return g;
    }

    canDraw(element: PlaitFreehand): boolean {
        return element.points.length >= 2;
    }
}

// ============================================================
// FlavourComponent - Manages element lifecycle & rendering
// ============================================================

export class FreehandComponent extends CommonElementFlavour<PlaitFreehand, PlaitBoard> {
    activeGenerator!: ActiveGenerator<PlaitFreehand>;
    generator!: FreehandGenerator;

    initializeGenerator() {
        this.activeGenerator = createActiveGenerator(this.board, {
            getRectangle: (element: PlaitFreehand) => {
                return RectangleClient.getRectangleByPoints(element.points);
            },
            getStrokeWidth: () => ACTIVE_STROKE_WIDTH,
            getStrokeOpacity: () => 1,
            hasResizeHandle: () => hasResizeHandle(this.board, this.element),
        });
        this.generator = new FreehandGenerator(this.board);
    }

    initialize(): void {
        super.initialize();
        this.initializeGenerator();
        this.generator.processDrawing(this.element, this.getElementG());
    }

    onContextChanged(
        value: { element: PlaitFreehand; selected: boolean; hasThemeChanged?: boolean },
        previous: { element: PlaitFreehand; selected: boolean; hasThemeChanged?: boolean }
    ) {
        if (value.element !== previous.element || value.hasThemeChanged) {
            this.generator.processDrawing(this.element, this.getElementG());
            this.activeGenerator.processDrawing(this.element, PlaitBoard.getActiveHost(this.board), { selected: this.selected });
        } else if (value.selected !== previous.selected || value.selected) {
            this.activeGenerator.processDrawing(this.element, PlaitBoard.getActiveHost(this.board), { selected: this.selected });
        }
    }

    destroy(): void {
        super.destroy();
        this.activeGenerator?.destroy();
    }
}

// ============================================================
// Plugin - Registers drawElement, isHit, getRectangle, etc.
// ============================================================

export const withFreehand: PlaitPlugin = (board: PlaitBoard) => {
    const { drawElement, getRectangle, isHit, isMovable, isAlign } = board;

    // Register the freehand component for rendering
    board.drawElement = (context) => {
        if (Freehand.isFreehand(context.element)) {
            return FreehandComponent as any;
        }
        return drawElement(context);
    };

    // Get bounding rectangle for freehand elements
    board.getRectangle = (element) => {
        if (Freehand.isFreehand(element)) {
            return RectangleClient.getRectangleByPoints(element.points);
        }
        return getRectangle(element);
    };

    // Hit detection for freehand elements
    board.isHit = (element, point) => {
        if (Freehand.isFreehand(element)) {
            const rect = RectangleClient.getRectangleByPoints(element.points);
            // Add some tolerance for thin strokes
            const tolerance = (element as PlaitFreehand).strokeWidth || 2;
            const expandedRect = RectangleClient.inflate(rect, tolerance + 4);
            return RectangleClient.isPointInRectangle(expandedRect, point);
        }
        return isHit(element, point);
    };

    // Freehand elements are movable
    board.isMovable = (element) => {
        if (Freehand.isFreehand(element)) return true;
        return isMovable(element);
    };

    // Freehand elements can be aligned
    board.isAlign = (element) => {
        if (Freehand.isFreehand(element)) return true;
        return isAlign(element);
    };

    return board;
};
