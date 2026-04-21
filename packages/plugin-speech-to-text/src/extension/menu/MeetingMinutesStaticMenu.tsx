import { Toggle, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@kn/ui";
import { Editor } from "@kn/editor";
import React from "react";
import { FileAudio } from "@kn/icon";
import { cn } from "@kn/ui";
import { dispatchMeetingMinutesPanelOpen } from "./MeetingMinutesPanel";

export const MeetingMinutesStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
    const handleOpen = () => {
        dispatchMeetingMinutesPanelOpen();
    };

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Toggle
                        size="sm"
                        onClick={handleOpen}
                        aria-label="Meeting minutes"
                        className={cn()}
                        data-meeting-minutes-trigger
                    >
                        <FileAudio className="h-4 w-4" />
                    </Toggle>
                </TooltipTrigger>
                <TooltipContent>
                    <p>Meeting Minutes</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};
