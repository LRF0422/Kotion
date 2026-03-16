import { PMNode as Node, ReactNodeViewRenderer } from '@kn/editor';
import { ResumeNodeView } from './ResumeNodeView';
import { v4 as uuidv4 } from 'uuid';

declare module '@kn/editor' {
  interface Commands<ReturnType> {
    resume: {
      insertResume: (data?: any) => ReturnType;
      updateResumeData: (data: any) => ReturnType;
    };
  }
}

// 默认简历数据
function createDefaultResumeData() {
  return {
    id: uuidv4(),
    title: '我的简历',
    blocks: []
  };
}

export const ResumeExtension = Node.create({
  name: 'resume',
  group: 'block',
  draggable: true,

  renderHTML() {
    return ['div', { class: 'node-resume' }, 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResumeNodeView, {
      stopEvent: () => true
    });
  },

  addAttributes() {
    return {
      data: {
        default: createDefaultResumeData()
      }
    };
  },

  addCommands() {
    return {
      insertResume: (data?: any) => ({ commands }: any) => {
        return commands.insertContent({
          type: this.name,
          attrs: {
            data: data || createDefaultResumeData()
          }
        });
      },
      updateResumeData: (data: any) => ({ tr, state, dispatch }: any) => {
        const { selection } = state;
        const node = selection.$anchor.node;

        if (node.type.name === this.name && dispatch) {
          dispatch(
            tr.setNodeMarkup(selection.$anchor.pos, undefined, {
              ...node.attrs,
              data
            })
          );
          return true;
        }
        return false;
      }
    };
  }
});
