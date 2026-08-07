import { i18n as i18nInstance } from "@kn/common";
import { Calendar as CalendarIcon, Clock } from "@kn/icon";
import { Button, Calendar, Input, Popover, PopoverContent, PopoverTrigger, Switch, cn } from "@kn/ui";
import { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";
import { addDays, format, parseISO } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import React, { useMemo, useState } from "react";
import { createT } from "../../i18n";

const DATE_ONLY_LENGTH = 10; // 'yyyy-MM-dd'

export const DateView: React.FC<NodeViewProps> = (props) => {
	const t = createT();
	const [open, setOpen] = useState(false);
	const editable = props.editor.isEditable;
	const isZh = i18nInstance?.language?.startsWith("zh");
	const locale = isZh ? zhCN : enUS;

	const raw = props.node.attrs.date as string | null;
	const withTime = !!raw && raw.length > DATE_ONLY_LENGTH;

	const dateValue = useMemo(() => {
		if (!raw) return undefined;
		const parsed = raw.length > DATE_ONLY_LENGTH ? new Date(raw) : parseISO(raw);
		return isNaN(parsed.getTime()) ? undefined : parsed;
	}, [raw]);

	const displayText = dateValue
		? format(
			dateValue,
			withTime
				? isZh
					? "yyyy年M月d日 HH:mm"
					: "MMM d, yyyy HH:mm"
				: isZh
					? "yyyy年M月d日"
					: "MMM d, yyyy",
			{ locale }
		)
		: t("datePicker.placeholder");

	const commit = (date: Date | undefined, includeTime: boolean) => {
		props.updateAttributes({
			date: date ? (includeTime ? date.toISOString() : format(date, "yyyy-MM-dd")) : null,
		});
	};

	const handleSelectDay = (day: Date | undefined) => {
		if (!day) return;
		const next = new Date(day);
		if (withTime && dateValue) {
			next.setHours(dateValue.getHours(), dateValue.getMinutes(), 0, 0);
		}
		commit(next, withTime);
	};

	const handleToggleTime = (checked: boolean) => {
		commit(dateValue ? new Date(dateValue) : new Date(), checked);
	};

	const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const [hours, minutes] = e.target.value.split(":").map(Number);
		if (isNaN(hours) || isNaN(minutes)) return;
		const next = dateValue ? new Date(dateValue) : new Date();
		next.setHours(hours, minutes, 0, 0);
		commit(next, true);
	};

	const quickPicks = [
		{ label: t("datePicker.today"), getDate: () => new Date() },
		{ label: t("datePicker.tomorrow"), getDate: () => addDays(new Date(), 1) },
	];

	const chip = (
		<button
			type="button"
			disabled={!editable}
			className={cn(
				"inline-flex h-6 select-none items-center gap-1 rounded-md px-1.5 text-sm outline-none transition-colors",
				editable ? "cursor-pointer hover:bg-accent focus-visible:bg-accent" : "cursor-default",
				!dateValue && "text-muted-foreground"
			)}
		>
			<CalendarIcon className="h-3.5 w-3.5 shrink-0" />
			<span className="whitespace-nowrap">{displayText}</span>
		</button>
	);

	if (!editable) {
		return (
			<NodeViewWrapper as="span" className="inline-flex align-middle">
				{chip}
			</NodeViewWrapper>
		);
	}

	return (
		<NodeViewWrapper as="span" className="inline-flex align-middle">
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>{chip}</PopoverTrigger>
				<PopoverContent align="start" className="w-auto p-0">
					<div className="flex items-center gap-1 border-b p-2">
						{quickPicks.map((pick) => (
							<Button
								key={pick.label}
								variant="ghost"
								size="sm"
								className="h-7 px-2 text-xs"
								onClick={() => handleSelectDay(pick.getDate())}
							>
								{pick.label}
							</Button>
						))}
					</div>
					<Calendar
						mode="single"
						selected={dateValue}
						onSelect={handleSelectDay}
						locale={locale}
						weekStartsOn={1}
						initialFocus
						className="p-2"
					/>
					<div className="flex items-center justify-between gap-4 border-t px-3 py-2">
						<span className="flex items-center gap-1.5 text-xs text-muted-foreground">
							<Clock className="h-3.5 w-3.5" />
							{t("datePicker.includeTime")}
						</span>
						<Switch checked={withTime} onCheckedChange={handleToggleTime} />
					</div>
					{withTime && (
						<div className="border-t px-3 py-2">
							<Input
								type="time"
								value={dateValue ? format(dateValue, "HH:mm") : ""}
								onChange={handleTimeChange}
								className="h-7 text-xs"
							/>
						</div>
					)}
					<div className="flex justify-end border-t p-2">
						<Button
							variant="ghost"
							size="sm"
							className="h-7 px-2 text-xs"
							onClick={() => {
								commit(undefined, false);
								setOpen(false);
							}}
						>
							{t("datePicker.clear")}
						</Button>
					</div>
				</PopoverContent>
			</Popover>
		</NodeViewWrapper>
	);
};
