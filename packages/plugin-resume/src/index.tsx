import { KPlugin, PluginConfig, ExtensionWrapper } from '@kn/common';
import { ResumeExtension } from './extension';

interface ResumePluginConfig extends PluginConfig {}

class ResumePlugin extends KPlugin<ResumePluginConfig> {}

export const resume = new ResumePlugin({
  name: 'Resume',
  status: 'ACTIVE',
  editorExtension: [{
    name: 'resume',
    extendsion: [ResumeExtension],
    slashConfig: [
      {
        text: '简历',
        slash: '/resume',
        action: (editor) => {
          editor.chain().focus().insertResume().run();
        }
      }
    ]
  }] as ExtensionWrapper[]
});
