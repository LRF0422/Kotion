import { KPlugin, PluginConfig } from '@kn/common';
import { SpeechToTextExtension } from './extension';

interface SpeechToTextPluginConfig extends PluginConfig { }

class SpeechToTextPlugin extends KPlugin<SpeechToTextPluginConfig> { }

export const speechToText = new SpeechToTextPlugin({
    status: 'ACTIVE',
    name: 'Speech to Text',
    editorExtension: [SpeechToTextExtension],
    locales: {
        zh: {
            translation: {
                speechToText: {
                    start: '开始录音',
                    stop: '停止录音',
                    notSupported: '此浏览器不支持语音识别，请使用 Chrome 或 Edge。',
                },
            },
        },
        en: {
            translation: {
                speechToText: {
                    start: 'Speech to text',
                    stop: 'Stop recording',
                    notSupported: 'Speech recognition is not supported in this browser. Please use Chrome or Edge.',
                },
            },
        },
    },
});

export { SpeechToTextExtension } from './extension';
export { useSpeechRecognition } from './hooks/useSpeechRecognition';
