/* Timeline view local types. */

export type DragType = "move" | "resize-left" | "resize-right" | null;

export interface DragState {
    recordId: string;
    type: DragType;
    startX: number;
    originalLeft: number;
    originalWidth: number;
    originalStartDate: Date;
    originalEndDate: Date;
}

export interface DragPreview {
    left: number;
    width: number;
}

export interface BarPosition {
    left: number;
    width: number;
    startDate: Date;
    endDate: Date;
}

export interface MilestonePosition {
    left: number;
    date: Date;
}

export type TimelineScale = "day" | "week" | "month";

export interface Dependency {
    from: string;
    to: string;
}
