import { ExtensionWrapper } from "@kn/common";
import { Extension } from "@kn/editor";
import { SpeechToTextStaticMenu } from "./menu/static";

/**
 * Minimal Tiptap extension placeholder for the speech-to-text plugin.
 * The actual logic lives in the static menu component via Web Speech API.
 */
const SpeechToTextExt = Extension.create({
    name: 'speechToText',
});

export const SpeechToTextExtension: ExtensionWrapper = {
    name: 'speechToText',
    extendsion: SpeechToTextExt,
    menuConfig: {
        group: 'block',
        menu: SpeechToTextStaticMenu,
    },
};
