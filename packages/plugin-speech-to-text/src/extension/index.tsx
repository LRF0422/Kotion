import React from "react";
import { ExtensionWrapper } from "@kn/common";
import { Extension } from "@kn/editor";
import { SpeechToTextPanel } from "./menu/SpeechToTextPanel";
import { SpeechToTextStaticMenu } from "./menu/static";
import { MeetingMinutesNode } from "./meeting-minutes/meeting-minutes";
import { FileAudio } from "@kn/icon";

const SpeechToTextExt = Extension.create({
    name: 'speechToText',
});

export const SpeechToTextExtension: ExtensionWrapper = {
    name: 'speechToText',
    extendsion: [SpeechToTextExt, MeetingMinutesNode],
    menuConfig: {
        group: 'block',
        menu: SpeechToTextStaticMenu,
    },
    floatingUI: SpeechToTextPanel,
    slashConfig: [
        {
            icon: <FileAudio className="h-4 w-4" />,
            text: '会议纪要',
            slash: '/meeting',
            action: (editor) => {
                editor.commands.insertMeetingMinutes();
            }
        },
    ],
};
