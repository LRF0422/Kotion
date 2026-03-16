import { KPlugin, PluginConfig } from '@kn/common';
import { ResumeEditor } from './pages/ResumeEditor';

interface ResumePluginConfig extends PluginConfig {}

class ResumePlugin extends KPlugin<ResumePluginConfig> {}

export const resume = new ResumePlugin({
  name: 'Resume',
  status: 'ACTIVE',
  routes: [
    { name: '/resume/new', path: '/resume/new', element: <ResumeEditor /> },
    { name: '/resume/edit/:id', path: '/resume/edit/:id', element: <ResumeEditor /> }
  ],
  editorExtension: []
});
