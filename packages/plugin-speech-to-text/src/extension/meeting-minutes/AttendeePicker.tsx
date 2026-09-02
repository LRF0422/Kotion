import React, { useCallback, useEffect, useState } from "react";
import { API, useApi, useDebounce, useTranslation } from "@kn/common";
import {
    Avatar, AvatarFallback, AvatarImage, AvatarGroup, Button,
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
        <div className="flex min-w-0 flex-wrap items-center gap-1.5" contentEditable={false}>
            <span className="flex h-8 shrink-0 select-none items-center text-xs text-muted-foreground">{m("attendees")}</span>

            {/* Selected avatars */}
            {value.length > 0 && (
                <div className="flex min-w-0 flex-wrap items-center gap-1">
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
                                className="group inline-flex h-11 items-center gap-1 rounded-full bg-muted pl-1 text-xs text-foreground lg:h-7"
                            >
                                <Avatar className="h-6 w-6 text-[9px] lg:h-5 lg:w-5">
                                    <AvatarImage src={a.avatar} />
                                    <AvatarFallback>{initials(a.name)}</AvatarFallback>
                                </Avatar>
                                <span className="max-w-[120px] truncate">{a.name}</span>
                                {!disabled && (
                                    <button
                                        type="button"
                                        onClick={() => remove(a.id)}
                                        className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground opacity-60 transition-colors hover:bg-background/70 hover:text-foreground hover:opacity-100 lg:h-7 lg:w-7"
                                        title={m("removeAttendee")}
                                        aria-label={m("removeAttendee")}
                                    >
                                        <X className="h-3.5 w-3.5" />
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
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-11 gap-1 rounded-full border border-dashed border-border px-2.5 text-xs font-normal text-muted-foreground hover:border-foreground/40 hover:text-foreground lg:h-8"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            {m("addAttendee")}
                        </Button>
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
                                            className="flex min-h-11 items-center gap-2 lg:min-h-8"
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
