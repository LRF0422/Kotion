import React, { useCallback, useEffect, useState } from "react";
import { API, useApi, useDebounce, useTranslation } from "@kn/common";
import {
    Avatar, AvatarFallback, AvatarImage, AvatarGroup,
    Popover, PopoverContent, PopoverTrigger,
    Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@kn/ui";
import { Plus, Check, X } from "@kn/icon";

// Defined locally (mirrors plugin-main's APIS.SEARCH_USERS) to avoid a
// circular dependency on @kn/plugin-main.
const SEARCH_USERS_API: API = {
    name: "searchUsers",
    url: "/knowledge-system/user/search",
    method: "GET",
};

export interface Attendee {
    id: string;
    name: string;
    avatar?: string;
}

interface AttendeePickerProps {
    value: Attendee[];
    onChange: (next: Attendee[]) => void;
    disabled?: boolean;
}

const initials = (name: string) => (name || "?").trim().charAt(0).toUpperCase();

export const AttendeePicker: React.FC<AttendeePickerProps> = ({ value, onChange, disabled }) => {
    const { t } = useTranslation();
    const m = useCallback((key: string) => t(`meetingMinutes.${key}`), [t]);

    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<Attendee[]>([]);
    const [loading, setLoading] = useState(false);

    const debouncedQuery = useDebounce(query, { wait: 300 });

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            const keyword = debouncedQuery.trim();
            if (keyword.length < 1) {
                setResults([]);
                return;
            }
            setLoading(true);
            try {
                const res = await useApi(SEARCH_USERS_API, { keyword, pageSize: 10 });
                const records = res?.data?.records || res?.data || [];
                const mapped: Attendee[] = (records as any[]).map((u) => ({
                    id: String(u.id),
                    name: u.name || u.nickName || u.username || u.account || "",
                    avatar: u.avatar || u.avatarUrl,
                }));
                if (!cancelled) setResults(mapped);
            } catch (err) {
                console.error("Failed to search attendees:", err);
                if (!cancelled) setResults([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        run();
        return () => { cancelled = true; };
    }, [debouncedQuery]);

    const isSelected = useCallback(
        (id: string) => value.some((a) => a.id === id),
        [value]
    );

    const toggle = useCallback((user: Attendee) => {
        if (isSelected(user.id)) {
            onChange(value.filter((a) => a.id !== user.id));
        } else {
            onChange([...value, user]);
        }
    }, [value, onChange, isSelected]);

    const remove = useCallback((id: string) => {
        onChange(value.filter((a) => a.id !== id));
    }, [value, onChange]);

    return (
        <div className="flex items-center gap-2 flex-wrap" contentEditable={false}>
            <span className="text-xs text-muted-foreground select-none shrink-0">{m("attendees")}</span>

            {/* Selected avatars */}
            {value.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                    {value.length > 3 ? (
                        <AvatarGroup max={4} spacing={8} className="items-center">
                            {value.map((a) => (
                                <Avatar key={a.id} className="h-6 w-6 text-[10px]">
                                    <AvatarImage src={a.avatar} />
                                    <AvatarFallback>{initials(a.name)}</AvatarFallback>
                                </Avatar>
                            ))}
                        </AvatarGroup>
                    ) : (
                        value.map((a) => (
                            <span
                                key={a.id}
                                className="group inline-flex items-center gap-1 pl-0.5 pr-1.5 py-0.5 rounded-full bg-muted text-xs text-foreground"
                            >
                                <Avatar className="h-5 w-5 text-[9px]">
                                    <AvatarImage src={a.avatar} />
                                    <AvatarFallback>{initials(a.name)}</AvatarFallback>
                                </Avatar>
                                <span className="max-w-[120px] truncate">{a.name}</span>
                                {!disabled && (
                                    <button
                                        type="button"
                                        onClick={() => remove(a.id)}
                                        className="opacity-50 hover:opacity-100 transition-opacity"
                                        title={m("removeAttendee")}
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                )}
                            </span>
                        ))
                    )}
                </div>
            )}

            {/* Add button + search popover */}
            {!disabled && (
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            className="inline-flex items-center gap-1 h-6 px-2 rounded-full border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                        >
                            <Plus className="h-3 w-3" />
                            {m("addAttendee")}
                        </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-0" align="start">
                        <Command shouldFilter={false}>
                            <CommandInput
                                placeholder={m("searchAttendeePlaceholder")}
                                value={query}
                                onValueChange={setQuery}
                            />
                            <CommandList>
                                {!loading && results.length === 0 && (
                                    <CommandEmpty>{m("noAttendeesFound")}</CommandEmpty>
                                )}
                                <CommandGroup>
                                    {results.map((user) => (
                                        <CommandItem
                                            key={user.id}
                                            value={user.id}
                                            onSelect={() => toggle(user)}
                                            className="flex items-center gap-2"
                                        >
                                            <Avatar className="h-6 w-6 text-[10px]">
                                                <AvatarImage src={user.avatar} />
                                                <AvatarFallback>{initials(user.name)}</AvatarFallback>
                                            </Avatar>
                                            <span className="flex-1 truncate">{user.name}</span>
                                            {isSelected(user.id) && (
                                                <Check className="h-4 w-4 text-blue-500" />
                                            )}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
            )}
        </div>
    );
};
