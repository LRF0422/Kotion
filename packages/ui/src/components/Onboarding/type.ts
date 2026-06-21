import type { ReactNode } from 'react';

export interface OnboardingStep {
  id: string;
  targetSelector: string; // CSS选择器，用于定位目标元素
  title: string;
  description: ReactNode;
  /** 提示框位置，默认自动计算。`placement` 为 `position` 的别名。 */
  position?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  actionText?: string; // 操作按钮文本，默认'下一步'
  onAction?: () => void; // 操作按钮点击回调
  skipable?: boolean; // 是否可跳过，默认true
  /** 是否允许点击高亮元素（遮罩穿透）。默认 false。 */
  allowInteraction?: boolean;
  /** 高亮区域额外内边距(px)。默认 8。 */
  spotlightPadding?: number;
}

export interface OnboardingProps {
  steps: OnboardingStep[];
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
  /** 进入某一步时回调（用于记录分步进度）。index 为该步在 steps 中的下标。 */
  onStepChange?: (step: OnboardingStep, index: number) => void;
  className?: string;
  maskColor?: string; // 遮罩层颜色
  highLightZIndex?: number; // 高亮区域z-index
  dialogZIndex?: number; // 提示框z-index
}
