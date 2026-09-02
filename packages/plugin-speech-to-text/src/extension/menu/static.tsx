import { Toggle, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@kn/ui";
import { Editor } from "@kn/editor";
import { useTranslation } from "@kn/common";
import React from "react";
import { FileAudio, Mic, MicOff } from "@kn/icon";
import { cn } from "@kn/ui";
import { useSpeechController } from "../../speech-controller";
import { startSpeech } from "./RecordingToast";

/** Map the app UI language to a speech-recognition locale (BCP-47). */
function resolveLang(uiLang?: string): string {
    if (uiLang && uiLang.toLowerCase().startsWith('zh')) return 'zh-CN';
    return 'en-US';
}

export const SpeechToTextStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
    const { t, i18n } = useTranslation();
    const { status, isSupported, stop } = useSpeechController();

    const isActive = status !== 'idle';

    const handleToggle = () => {
        if (isActive) {
            stop();
        } else {
            startSpeech(editor, resolveLang(i18n?.language));
        }
    };

    return (
        <TooltipProvider>
            <div className="flex items-center gap-0.5">
                {isSupported && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Toggle
                                size="sm"
                                pressed={isActive}
                                onClick={handleToggle}
                                aria-label="Toggle speech to text"
                                className={cn(isActive && "text-destructive")}
                                data-speech-to-text-trigger
                            >
                                {isActive
                                    ? <MicOff className="h-4 w-4 animate-pulse" />
                                    : <Mic className="h-4 w-4" />
                                }
                            </Toggle>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{isActive ? t('speechToText.stop') : t('speechToText.start')}</p>
                        </TooltipContent>
                    </Tooltip>
                )}

                <Tooltip>
                    <TooltipTrigger asChild>
                        <Toggle
                            size="sm"
                            pressed={false}
                            onClick={() => editor.commands.insertMeetingMinutes({ lang: resolveLang(i18n?.language) })}
                            aria-label={t('meetingMinutes.newMeeting', 'Insert meeting minutes')}
                        >
                            <FileAudio className="h-4 w-4" />
                        </Toggle>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>{t('meetingMinutes.newMeeting', 'Insert meeting minutes')}</p>
                    </TooltipContent>
                </Tooltip>
            </div>
        </TooltipProvider>
    );
};
