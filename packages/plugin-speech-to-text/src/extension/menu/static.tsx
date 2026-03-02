import { Toggle, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@kn/ui";
import { Editor } from "@kn/editor";
import React from "react";
import { Mic, MicOff } from "@kn/icon";
import { cn } from "@kn/ui";
import { useSpeechRecognition } from "../../hooks/useSpeechRecognition";

export const SpeechToTextStaticMenu: React.FC<{ editor: Editor }> = ({ editor }) => {
    const {
        isRecording,
        isSupported,
        startRecording,
        stopRecording,
    } = useSpeechRecognition({ editor });

    const handleToggle = () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    };

    if (!isSupported) {
        return null;
    }

    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Toggle
                        size="sm"
                        pressed={isRecording}
                        onClick={handleToggle}
                        aria-label="Toggle speech to text"
                        className={cn(isRecording && "text-destructive")}
                    >
                        {isRecording
                            ? <MicOff className={cn("h-4 w-4", isRecording && "animate-pulse")} />
                            : <Mic className="h-4 w-4" />
                        }
                    </Toggle>
                </TooltipTrigger>
                <TooltipContent>
                    <p>{isRecording ? 'Stop recording' : 'Speech to text'}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};
