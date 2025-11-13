export interface OnboardingStep {
  id: string;
  targetSelector: string; // CSS选择器，用于定位目标元素
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right'; // 提示框位置，默认自动计算
  actionText?: string; // 操作按钮文本，默认'下一步'
  onAction?: () => void; // 操作按钮点击回调
  skipable?: boolean; // 是否可跳过，默认true
}

export interface OnboardingProps {
  steps: OnboardingStep[];
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
  className?: string;
  maskColor?: string; // 遮罩层颜色
  highLightZIndex?: number; // 高亮区域z-index
  dialogZIndex?: number; // 提示框z-index
}