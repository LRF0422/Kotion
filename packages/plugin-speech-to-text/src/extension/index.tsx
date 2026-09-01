import React from "react";
import { ExtensionWrapper } from "@kn/common";
import { Extension } from "@kn/editor";
import { SpeechToTextStaticMenu } from "./menu/static";
import { MeetingMinutesNode, MeetingTabNotesNode, MeetingTabSummaryNode, MeetingTabTranscriptNode } from "./meeting-minutes/meeting-minutes";
import { FileAudio } from "@kn/icon";
import { dispatchCreateMeetingPage, MeetingPageLauncherBridge } from "../meeting-page";

const SpeechToTextExt = Extension.create({
    name: 'speechToText',
});

export const SpeechToTextExtension: ExtensionWrapper = {
    name: 'speechToText',
    extendsion: [SpeechToTextExt, MeetingMinutesNode, MeetingTabNotesNode, MeetingTabSummaryNode, MeetingTabTranscriptNode],
    menuConfig: {
        group: 'block',
        menu: SpeechToTextStaticMenu,
    },
    floatingUI: MeetingPageLauncherBridge,
    slashConfig: [
        {
            icon: <FileAudio className="h-4 w-4" />,
            text: 'Meeting Minutes',
            slash: '/meeting',
            action: () => {
                dispatchCreateMeetingPage();
            }
        },
    ],
};
