import { useState, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ResumeData, ResumeBlock, BlockType, defaultStyleConfig, StyleConfig, BlockData } from '../types/resume';

const STORAGE_KEY = 'resume_draft';

function createEmptyResume(): ResumeData {
  return {
    id: uuidv4(),
    title: '我的简历',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
    blocks: []
  };
}

export function useResume(initialData?: ResumeData) {
  const [resume, setResume] = useState<ResumeData>(initialData || createEmptyResume());
  const [style, setStyle] = useState<StyleConfig>(defaultStyleConfig);
  const [isDirty, setIsDirty] = useState(false);

  // 从 localStorage 恢复草稿
  useEffect(() => {
    if (!initialData) {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setResume(parsed.resume);
          setStyle(parsed.style || defaultStyleConfig);
        } catch (e) {
          console.error('Failed to load draft:', e);
        }
      }
    }
  }, [initialData]);

  // 自动保存到 localStorage
  useEffect(() => {
    if (isDirty) {
      const timer = setTimeout(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ resume, style }));
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [resume, style, isDirty]);

  const updateTitle = useCallback((title: string) => {
    setResume(prev => ({ ...prev, title, updatedAt: new Date().toISOString() }));
    setIsDirty(true);
  }, []);

  const addBlock = useCallback((type: BlockType) => {
    const newBlock: ResumeBlock = {
      id: uuidv4(),
      type,
      data: getDefaultBlockData(type),
      order: resume.blocks.length
    };
    setResume(prev => ({
      ...prev,
      blocks: [...prev.blocks, newBlock],
      updatedAt: new Date().toISOString()
    }));
    setIsDirty(true);
    return newBlock.id;
  }, [resume.blocks.length]);

  const updateBlock = useCallback((id: string, data: Partial<BlockData>) => {
    setResume(prev => ({
      ...prev,
      blocks: prev.blocks.map(b => b.id === id ? { ...b, data: { ...b.data, ...data } } : b),
      updatedAt: new Date().toISOString()
    }));
    setIsDirty(true);
  }, []);

  const removeBlock = useCallback((id: string) => {
    setResume(prev => ({
      ...prev,
      blocks: prev.blocks.filter(b => b.id !== id).map((b, i) => ({ ...b, order: i })),
      updatedAt: new Date().toISOString()
    }));
    setIsDirty(true);
  }, []);

  const moveBlock = useCallback((id: string, direction: 'up' | 'down') => {
    setResume(prev => {
      const blocks = [...prev.blocks];
      const index = blocks.findIndex(b => b.id === id);
      if (index === -1) return prev;

      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= blocks.length) return prev;

      [blocks[index], blocks[newIndex]] = [blocks[newIndex], blocks[index]];
      return {
        ...prev,
        blocks: blocks.map((b, i) => ({ ...b, order: i })),
        updatedAt: new Date().toISOString()
      };
    });
    setIsDirty(true);
  }, []);

  const updateStyle = useCallback((newStyle: Partial<StyleConfig>) => {
    setStyle(prev => ({ ...prev, ...newStyle }));
    setIsDirty(true);
  }, []);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setIsDirty(false);
  }, []);

  return {
    resume,
    style,
    isDirty,
    updateTitle,
    addBlock,
    updateBlock,
    removeBlock,
    moveBlock,
    updateStyle,
    clearDraft
  };
}

function getDefaultBlockData(type: BlockType): BlockData {
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
