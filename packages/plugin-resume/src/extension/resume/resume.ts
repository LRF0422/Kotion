import { PMNode as Node, ReactNodeViewRenderer } from '@kn/editor';
import { ResumeNodeView } from './ResumeNodeView';
import { v4 as uuidv4 } from 'uuid';

declare module '@kn/editor' {
  interface Commands<ReturnType> {
    resume: {
      insertResume: (data?: any) => ReturnType;
      updateResumeData: (data: any) => ReturnType;
      addResumeBlock: (type: string) => ReturnType;
    };
  }
}

// 默认简历数据
function createDefaultResumeData() {
  return {
    id: uuidv4(),
    title: '我的简历',
    columns: [
      { id: uuidv4(), width: 1, blocks: [] },
      { id: uuidv4(), width: 1, blocks: [] }
    ]
  };
}

// 获取默认区块数据
function getDefaultBlockData(type: string): any {
  switch (type) {
    case 'basicInfo':
      return { name: '', email: '', phone: '' };
    case 'education':
      return { id: uuidv4(), school: '', degree: '', major: '', startDate: '', endDate: '', isOngoing: false };
    case 'work':
      return { id: uuidv4(), company: '', position: '', startDate: '', endDate: '', isOngoing: false };
    case 'skill':
      return { id: uuidv4(), name: '', level: 'familiar' };
    case 'project':
      return { id: uuidv4(), name: '', time: '', role: '' };
    case 'award':
      return { id: uuidv4(), name: '', issuer: '', date: '' };
    case 'custom':
      return { content: '', style: 'normal' };
    default:
      return {};
  }
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
      },
      addResumeBlock: (type: string) => ({ tr, state, dispatch }: any) => {
        const { selection } = state;
        const node = selection.$anchor.node;

        if (node && node.type.name === 'resume' && dispatch) {
          const data = node.attrs.data || createDefaultResumeData();
          if (data.columns && data.columns.length > 0) {
            const newBlock = {
              id: uuidv4(),
              type,
              data: getDefaultBlockData(type)
            };
            const newColumns = [...data.columns];
            newColumns[0] = {
              ...newColumns[0],
              blocks: [...newColumns[0].blocks, newBlock]
            };
            dispatch(tr.setNodeMarkup(selection.$anchor.pos, undefined, {
              ...node.attrs,
              data: { ...data, columns: newColumns }
            }));
            return true;
          }
        }
        return false;
      }
    };
  }
});
