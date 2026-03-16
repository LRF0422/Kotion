import { KPlugin, PluginConfig } from '@kn/common';
import { ResumeExtension } from './extension';

interface ResumePluginConfig extends PluginConfig {}

class ResumePlugin extends KPlugin<ResumePluginConfig> {}

export const resume = new ResumePlugin({
  name: 'Resume',
  status: 'ACTIVE',
  editorExtension: [ResumeExtension]
});
