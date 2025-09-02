import { Board, BoardChangeData, Wrapper } from '@plait-board/react-board';
import {
    PlaitBoard,
    PlaitBoardOptions,
    PlaitElement,
    PlaitPlugin,
    PlaitPointerType,
    PlaitTheme,
    Selection,
    ThemeColorMode,
    Viewport,
} from '@plait/core';
import React from 'react';
import { MindThemeColors, withMind } from '@plait/mind';
import { withDraw } from '@plait/draw';
import { withGroup } from '@plait/common';

export type OnlyMindProps = {
    value: PlaitElement[];
    viewport?: Viewport;
    theme?: PlaitTheme;
    readonly?: boolean;
    onChange?: (value: BoardChangeData) => void;
    onSelectionChange?: (selection: Selection | null) => void;
    onValueChange?: (value: PlaitElement[]) => void;
    onViewportChange?: (value: Viewport) => void;
    onThemeChange?: (value: ThemeColorMode) => void;
    afterInit?: (board: PlaitBoard) => void;
} & React.HTMLAttributes<HTMLDivElement>;

export const OnlyMind: React.FC<OnlyMindProps> = ({
    value,
    viewport,
    theme,
    onChange,
    onSelectionChange,
    onViewportChange,
    onThemeChange,
    onValueChange,
    afterInit,
    readonly = false
}) => {
    const options: PlaitBoardOptions = {
        readonly: readonly,
        hideScrollbar: false,
        disabledScrollOnNonFocus: false,
        themeColors: MindThemeColors,
    };
    const plugins: any[] = [withDraw, withGroup, withMind];
    return (
        <Wrapper
            value={value}
            viewport={viewport}
            theme={theme}
            options={options}
            plugins={plugins}
            onChange={(data: BoardChangeData) => {
                onChange && onChange(data);
            }}
            onSelectionChange={onSelectionChange}
            onViewportChange={onViewportChange}
            onThemeChange={onThemeChange}
            onValueChange={onValueChange}
        >
            <Board afterInit={afterInit}></Board>
        </Wrapper>
    );
};