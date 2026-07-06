import React from "react";
import { Plus } from "@kn/icon";

interface AddRowBarProps {
    onAdd: () => void;
    label?: string;
}

/**
 * Bottom "+" row for inline record creation.
 * Click to add a new empty record.
 */
export const AddRowBar: React.FC<AddRowBarProps> = ({ onAdd, label }) => {
    return (
        <div className="bitable-add-row" onClick={onAdd}>
            <Plus style={{ width: 16, height: 16 }} />
            <span>{label || "Add record"}</span>
        </div>
    );
};
