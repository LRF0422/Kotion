import React, { useState, useRef } from "react";
import { Button, Input, Popover, PopoverTrigger, PopoverContent } from "@kn/ui";
import { Plus, User } from "@kn/icon";
import { useSelector, GlobalState } from "@kn/common";
import { Person, FieldConfig } from "../../types";
import { generateRecordId } from "../../utils/id";
import { toPersonArray, PersonChip } from "./shared";
import { FieldRendererProps, FieldEditorProps } from "./types";

export const PersonRenderer: React.FC<FieldRendererProps> = ({ value }) => {
    const people = toPersonArray(value);
    if (people.length === 0) return <div className="text-sm text-gray-400 dark:text-gray-500">-</div>;
    return (
        <div className="flex items-center gap-1 flex-wrap">
            {people.map((p, i) => (
                <PersonChip key={p.id || i} person={p} />
            ))}
        </div>
    );
};

/** Read-only person editor (for created_by / updated_by). */
export const PersonReadonlyEditor: React.FC<FieldEditorProps> = ({ value }) => (
    <div className="p-2">
        <PersonRenderer value={value} field={{} as FieldConfig} />
    </div>
);

export const PersonEditor: React.FC<FieldEditorProps> = ({ value, field, onChange, onSave }) => {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const userInfo = useSelector((s: GlobalState) => s.userInfo);
    const allowMultiple = field.format === "multiple";
    const people = toPersonArray(value);

    const workingRef = useRef<any>(value);
    workingRef.current = value;

    const commit = (next: Person[]) => {
        const out: any = allowMultiple ? next : next.slice(-1);
        const persisted = out.length === 0 ? null : allowMultiple ? out : out[0];
        workingRef.current = persisted;
        onChange(persisted);
        onSave?.(persisted);
    };

    const addPerson = (p: Person) => {
        if (!allowMultiple) {
            commit([p]);
            return;
        }
        const cur = toPersonArray(workingRef.current);
        if (cur.some((x) => x.id === p.id)) return;
        commit([...cur, p]);
    };

    const addByName = () => {
        const n = name.trim();
        if (!n) return;
        addPerson({ id: generateRecordId(), name: n });
        setName("");
    };

    const currentUserPerson: Person | undefined =
        userInfo && (userInfo.id || userInfo.account || userInfo.email)
            ? {
                  id: (userInfo.id || userInfo.account || userInfo.email)!,
                  name: userInfo.name || userInfo.account || userInfo.email || "Me",
                  avatar: userInfo.avatar,
                  email: userInfo.email,
              }
            : undefined;

    return (
        <Popover open={open} onOpenChange={(o) => setOpen(o)}>
            <PopoverTrigger asChild>
                <div className="w-full h-full flex items-center cursor-pointer px-1" onMouseDown={(e) => e.preventDefault()}>
                    {people.length > 0 ? (
                        <PersonRenderer value={value} field={field} />
                    ) : (
                        <span className="text-gray-400 dark:text-gray-500 inline-flex items-center gap-1">
                            <User className="h-4 w-4" />
                            <Plus className="h-3 w-3" />
                        </span>
                    )}
                </div>
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={4} className="bg-white dark:bg-card p-3 w-72" onOpenAutoFocus={(e) => e.preventDefault()}>
                <div className="space-y-2">
                    {people.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {people.map((p, i) => (
                                <PersonChip key={p.id || i} person={p} onRemove={() => commit(people.filter((_, idx) => idx !== i))} />
                            ))}
                        </div>
                    )}
                    {currentUserPerson && !people.some((p) => p.id === currentUserPerson.id) && (
                        <Button size="sm" variant="outline" className="w-full h-8 text-sm justify-start" onClick={() => addPerson(currentUserPerson)}>
                            <User className="h-4 w-4 mr-1.5" /> {currentUserPerson.name}
                        </Button>
                    )}
                    <div className="flex gap-2">
                        <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Add a person..."
                            className="h-8 flex-1 text-sm"
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    addByName();
                                }
                            }}
                        />
                        <Button size="sm" variant="outline" className="h-8 px-2" disabled={!name.trim()} onClick={addByName}>
                            <Plus className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
};
