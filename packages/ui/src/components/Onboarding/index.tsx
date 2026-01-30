// src/components/onboarding/onboarding.tsx
import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@ui/components/ui/dialog';
import { Button } from '@ui/components/ui/button';
import { OnboardingProps, OnboardingStep } from './type';
import { cn } from '@ui/lib/utils';
import React from 'react';

export function Onboarding({
  steps,
  isOpen,
  onClose,
  onComplete,
  className,
  maskColor = 'rgba(0, 0, 0, 0.7)',
  highLightZIndex = 1000,
  dialogZIndex = 1001,
}: OnboardingProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const maskRef = useRef<HTMLDivElement>(null);
  const highLightRef = useRef<HTMLDivElement>(null);

  // 重置步骤
  useEffect(() => {
    if (isOpen) {
      setCurrentStepIndex(0);
    }
  }, [isOpen]);

  // 更新高亮区域和提示框位置
  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      const currentStep = steps[currentStepIndex];
      const targetElement = document.querySelector(currentStep.targetSelector);

      if (!targetElement || !highLightRef.current) return;

      // 获取目标元素位置信息
      const targetRect = targetElement.getBoundingClientRect();

      // 设置高亮区域位置和大小
      highLightRef.current.style.width = `${targetRect.width}px`;
      highLightRef.current.style.height = `${targetRect.height}px`;
      highLightRef.current.style.left = `${targetRect.left}px`;
      highLightRef.current.style.top = `${targetRect.top}px`;
      highLightRef.current.classList.add("outline")
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, currentStepIndex, steps]);

  // 获取当前步骤
  const currentStep = steps[currentStepIndex];

  // 计算提示框位置
  const getDialogPosition = () => {
    if (!currentStep) return {};

    const targetElement = document.querySelector(currentStep.targetSelector);
    if (!targetElement) return {};

    const targetRect = targetElement.getBoundingClientRect();
    const position = currentStep.position;

    if (position === 'top') {
      return {
        top: `${targetRect.top - 200}px`, // 假设提示框高度约200px
        left: `${targetRect.left}px`,
      };
    } else if (position === 'bottom') {
      return {
        top: `${targetRect.bottom + 16}px`,
        left: `${targetRect.left}px`,
      };
    } else if (position === 'left') {
      return {
        top: `${targetRect.top}px`,
        left: `${targetRect.left - 300}px`, // 假设提示框宽度约300px
      };
    } else if (position === 'right') {
      return {
        top: `${targetRect.top}px`,
        left: `${targetRect.right + 16}px`,
      };
    }

    // 默认自动计算位置（优先下方）
    if (window.innerHeight - targetRect.bottom > 200) {
      return {
        top: `${targetRect.bottom + 16}px`,
        left: `${targetRect.left}px`,
      };
    } else if (targetRect.top > 200) {
      return {
        top: `${targetRect.top - 200}px`,
        left: `${targetRect.left}px`,
      };
    } else if (window.innerWidth - targetRect.right > 300) {
      return {
        top: `${targetRect.top}px`,
        left: `${targetRect.right + 16}px`,
      };
    } else {
      return {
        top: `${targetRect.top}px`,
        left: `${targetRect.left - 300}px`,
      };
    }
  };

  // 下一步
  const handleNext = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
      if (currentStep.onAction) {
        currentStep.onAction();
      }
    } else {
      // 完成引导
      onClose();
      if (onComplete) {
        onComplete();
      }
    }
  };

  // 跳过
  const handleSkip = () => {
    onClose();
    if (onComplete) {
      onComplete();
    }
  };

  if (!isOpen || !currentStep) return null;

  const dialogPosition = getDialogPosition();

  return (isOpen && dialogPosition &&
    <div className="fixed inset-0 z-[999]" ref={maskRef}>
      {/* 遮罩层 */}
      <div
        className="fixed inset-0"
        // style={{ backgroundColor: maskColor }}
        onClick={handleSkip}
      />

      {/* 高亮区域 */}
      <div
        ref={highLightRef}
        className="fixed rounded-md pointer-events-none transition-all duration-300"
        style={{
          zIndex: highLightZIndex,
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
          borderRadius: '4px',
        }}
      />

      {/* 提示框 */}
      <div
        className={cn("max-w-md w-auto p-0 overflow-hidden bg-popover rounded-sm border-none", className)}
        style={{
          position: 'fixed',
          zIndex: dialogZIndex,
          ...dialogPosition,
          margin: 0,
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        }}
      >
        <div className="p-6">
          <div className="text-xl font-bold">
            {currentStep.title}
          </div>
          <div className="mt-2 text-base">
            {currentStep.description}
          </div>
        </div>

        <div className="flex justify-between items-center p-6">
          {currentStep.skipable !== false && (
            <Button
              variant="ghost"
              onClick={handleSkip}
              className="text-sm"
            >
              跳过
            </Button>
          )}

          <Button
            onClick={handleNext}
            className="px-6"
          >
            {currentStep.actionText ||
              (currentStepIndex === steps.length - 1 ? '完成' : '下一步')}
          </Button>
        </div>
      </div>
    </div>
  );
}