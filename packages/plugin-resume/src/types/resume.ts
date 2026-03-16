// 简历元数据
export interface ResumeData {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  blocks: ResumeBlock[];
}

// 组件块
export interface ResumeBlock {
  id: string;
  type: BlockType;
  data: BlockData;
  order: number;
}

export type BlockType = 'basicInfo' | 'education' | 'work' | 'skill' | 'project' | 'award' | 'custom';

export type BlockData = BasicInfoData | EducationData | WorkData | SkillData | ProjectData | AwardData | CustomData;

// 基础信息
export interface BasicInfoData {
  name: string;
  email: string;
  phone: string;
  address?: string;
  avatar?: string;
  summary?: string;
}

// 教育经历
export interface EducationData {
  id: string;
  school: string;
  degree: string;
  major: string;
  startDate: string;
  endDate: string | null;
  isOngoing: boolean;
  description?: string;
}

// 工作经历
export interface WorkData {
  id: string;
  company: string;
  position: string;
  startDate: string;
  endDate: string | null;
  isOngoing: boolean;
  description?: string;
}

// 技能
export interface SkillData {
  id: string;
  name: string;
  level: 'beginner' | 'familiar' | 'expert';
  category?: string;
}

// 项目经验
export interface ProjectData {
  id: string;
  name: string;
  time: string;
  role: string;
  techStack?: string[];
  description?: string;
}

// 证书奖项
export interface AwardData {
  id: string;
  name: string;
  issuer: string;
  date: string;
  description?: string;
}

// 自定义文本
export interface CustomData {
  content: string;
  style?: 'normal' | 'heading' | 'quote';
}

// 风格配置
export interface StyleConfig {
  theme: 'blue' | 'green' | 'purple' | 'dark' | 'light';
  titleFont: string;
  bodyFont: string;
  layout: 'single' | 'double' | 'triple';
  spacing: 'compact' | 'normal' | 'loose';
}

// 默认风格配置
export const defaultStyleConfig: StyleConfig = {
  theme: 'blue',
  titleFont: 'Inter',
  bodyFont: 'Inter',
  layout: 'single',
  spacing: 'normal'
};

// Block 类型显示名称
export const blockTypeLabels: Record<BlockType, string> = {
  basicInfo: '基础信息',
  education: '教育经历',
  work: '工作经历',
  skill: '技能',
  project: '项目经验',
  award: '证书奖项',
  custom: '自定义文本'
};
