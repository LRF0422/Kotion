import { KPlugin, PluginConfig, ExtensionWrapper } from '@kn/common';
import { ResumeExtension } from './extension';
import { Editor } from '@kn/editor';

interface ResumePluginConfig extends PluginConfig {}

class ResumePlugin extends KPlugin<ResumePluginConfig> {}

const blockTypes = [
  { type: 'basicInfo', label: '基础信息', slash: '/基础信息' },
  { type: 'education', label: '教育经历', slash: '/教育' },
  { type: 'work', label: '工作经历', slash: '/工作' },
  { type: 'skill', label: '技能', slash: '/技能' },
  { type: 'project', label: '项目经验', slash: '/项目' },
  { type: 'award', label: '证书奖项', slash: '/奖项' },
  { type: 'custom', label: '自定义文本', slash: '/文本' }
];

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
        action: (editor: Editor) => {
          editor.chain().focus().insertResume().run();
        }
      },
      ...blockTypes.map(bt => ({
        text: bt.label,
        slash: bt.slash,
        action: (editor: Editor) => {
          editor.chain().focus().addResumeBlock(bt.type).run();
        }
      }))
    ]
  }] as ExtensionWrapper[]
});
