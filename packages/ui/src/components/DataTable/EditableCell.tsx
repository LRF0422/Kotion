import * as React from "react";
import { CellContext } from "@tanstack/react-table";


interface EditableCellProps<TData, TValue> extends CellContext<TData, TValue> {
    renderInput: (props: {
        value: TValue;
        onChange: (
            value: unknown
        ) => void;
        onBlur: () => void;
        onValueChange: (value: string) => void;
        onKeyDown: (e: React.KeyboardEvent) => void;
        cancelEditing: () => void;
        className?: string;
    }) => React.ReactElement;
}

export function EditableCell<TData, TValue>({
    getValue,
    row: { index: rowId }, // TODO: better to use id instead of index because if we want row DnD, index will change. This is hard to do because we can't iterate over rows as easily.
    column: { id: colId },
    table,
    renderInput,
}: EditableCellProps<TData, TValue>): React.ReactElement {
    const initialValue = getValue();
    const [isEditing, setIsEditing] = React.useState(false);
    const [value, setValue] = React.useState<TValue>(initialValue);

    const onDoubleClick = () => setIsEditing(true);

    const cancelEditing = () => {
        setValue(initialValue);
        setIsEditing(false);
    };

    const onValueChange = (value: string) => {
        setValue(value as unknown as TValue);
        setIsEditing(false);
        table.options.meta?.updateData(rowId, colId, value);
    };

    const onChange = (
        value: unknown
    ) => {
        setValue(value as unknown as TValue);
    };

    const handleEndEditing = () => {
        setIsEditing(false);
        table.options.meta?.updateData(rowId, colId, value);
    };

    const handleKeyDownOnEdit = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handleEndEditing();
        } else if (e.key === "Escape") {
            cancelEditing();
        } else if (e.key === "Tab") {
            handleEndEditing();
        } else {
            // Prevent Arrow key events from being picked up by the cell selection event
            // handlers to allow users to use the arrow keys to navigate the input field
            e.stopPropagation();
        }
    };

    const handleKeyDownOnView = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.stopPropagation();
            setIsEditing(true);
        }
    };

    const handleBlur = () => handleEndEditing();

    React.useEffect(() => {
        setValue(initialValue);
    }, [initialValue]);

    if (isEditing) {
        return (
            <div
                onDoubleClick={onDoubleClick}
                className="qz__data-table__editable-cell--editing"
                tabIndex={0}
            >
                {renderInput({
                    value,
                    onChange,
                    onBlur: handleBlur,
                    onValueChange,
                    onKeyDown: handleKeyDownOnEdit,
                    cancelEditing,
                })}
            </div>
        );
    }

    return (
        <div
            onKeyDown={handleKeyDownOnView}
            onDoubleClick={onDoubleClick}
            className="qz__data-table__editable-cell--viewing"
            tabIndex={0}
        >
            {value ? String(value) : "-"}
        </div>
    );
}
