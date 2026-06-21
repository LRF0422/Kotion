// src/components/onboarding/onboarding.tsx
import { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { Button } from '@ui/components/ui/button';
import { OnboardingProps, OnboardingStep } from './type';
import { cn } from '@ui/lib/utils';
import React from 'react';

interface Rect { top: number; left: number; width: number; height: number; }

const GAP = 12; // 弹窗与高亮之间的间距

function resolvePlacement(step: OnboardingStep): 'top' | 'bottom' | 'left' | 'right' | 'auto' {
  return step.placement ?? step.position ?? 'auto';
}

/** 计算弹窗位置:按 placement 摆放,越界时翻转 + 夹取到视口内。 */
function computePopoverPosition(
  hole: Rect,
  popover: { width: number; height: number },
  placement: 'top' | 'bottom' | 'left' | 'right' | 'auto',
): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 8;

  const fits = {
    bottom: vh - (hole.top + hole.height) >= popover.height + GAP + margin,
    top: hole.top >= popover.height + GAP + margin,
    right: vw - (hole.left + hole.width) >= popover.width + GAP + margin,
    left: hole.left >= popover.width + GAP + margin,
  };

  let side = placement;
  if (side === 'auto') {
    side = fits.bottom ? 'bottom' : fits.top ? 'top' : fits.right ? 'right' : 'left';
  } else if (!fits[side]) {
    // 翻转到对侧或任意可放下的一侧
    const opposite = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' } as const;
    side = fits[opposite[side]] ? opposite[side] : (fits.bottom ? 'bottom' : fits.top ? 'top' : fits.right ? 'right' : 'left');
  }

  let top = 0;
  let left = 0;
  switch (side) {
    case 'top':
      top = hole.top - popover.height - GAP;
      left = hole.left + hole.width / 2 - popover.width / 2;
      break;
    case 'bottom':
      top = hole.top + hole.height + GAP;
      left = hole.left + hole.width / 2 - popover.width / 2;
      break;
    case 'left':
      top = hole.top + hole.height / 2 - popover.height / 2;
      left = hole.left - popover.width - GAP;
      break;
    case 'right':
      top = hole.top + hole.height / 2 - popover.height / 2;
      left = hole.left + hole.width + GAP;
      break;
  }

  // 夹取到视口内
  left = Math.max(margin, Math.min(left, vw - popover.width - margin));
  top = Math.max(margin, Math.min(top, vh - popover.height - margin));
  return { top, left };
}

export function Onboarding({
  steps,
  isOpen,
  onClose,
  onComplete,
  onStepChange,
  className,
  maskColor = 'rgba(0, 0, 0, 0.5)',
  highLightZIndex = 1000,
  dialogZIndex = 1001,
}: OnboardingProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [popoverSize, setPopoverSize] = useState({ width: 320, height: 160 });
  const popoverRef = useRef<HTMLDivElement>(null);

  const currentStep: OnboardingStep | undefined = steps[currentStepIndex];

  // 打开时重置到第一步
  useEffect(() => {
    if (isOpen) setCurrentStepIndex(0);
  }, [isOpen]);

  // 进入某一步时:滚动到目标并回调进度
  useEffect(() => {
    if (!isOpen || !currentStep) return;
    const el = document.querySelector(currentStep.targetSelector);
    el?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    onStepChange?.(currentStep, currentStepIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentStepIndex]);

  // 测量目标位置,监听 resize/scroll 重定位(rAF 节流)
  useEffect(() => {
    if (!isOpen || !currentStep) return;

    let raf = 0;
    const measure = () => {
      const el = document.querySelector(currentStep.targetSelector);
      if (!el) { setTargetRect(prev => (prev === null ? prev : null)); return; }
      const r = el.getBoundingClientRect();
      const pad = currentStep.spotlightPadding ?? 8;
      const next: Rect = {
        top: r.top - pad,
        left: r.left - pad,
        width: r.width + pad * 2,
        height: r.height + pad * 2,
      };
      // 值未变化则跳过,避免 MutationObserver 触发的无限重测循环
      setTargetRect(prev =>
        prev &&
          prev.top === next.top && prev.left === next.left &&
          prev.width === next.width && prev.height === next.height
          ? prev
          : next,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    // 目标可能在切换路由 / beforeStep 后才出现,监听 DOM 变化重新测量
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [isOpen, currentStepIndex, currentStep]);

  // 测量弹窗真实尺寸
  useLayoutEffect(() => {
    if (!isOpen || !popoverRef.current) return;
    const r = popoverRef.current.getBoundingClientRect();
    if (r.width && r.height) {
      setPopoverSize(prev =>
        prev.width === r.width && prev.height === r.height ? prev : { width: r.width, height: r.height },
      );
    }
  }, [isOpen, currentStepIndex, targetRect]);

  const handleNext = useCallback(() => {
    currentStep?.onAction?.();
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(i => i + 1);
    } else {
      // 完成最后一步:先标记完成,再关闭
      onComplete?.();
      onClose();
    }
  }, [currentStep, currentStepIndex, steps.length, onClose, onComplete]);

  // 跳过:仅关闭,不触发 onComplete(由宿主记录为 dismiss)
  const handleSkip = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!isOpen || !currentStep) return null;

  const allowInteraction = currentStep.allowInteraction ?? false;
  const placement = resolvePlacement(currentStep);
  const isLast = currentStepIndex === steps.length - 1;

  // 无法定位目标时,降级为屏幕居中的卡片
  const pos = targetRect
    ? computePopoverPosition(targetRect, popoverSize, placement)
    : { top: window.innerHeight / 2 - popoverSize.height / 2, left: window.innerWidth / 2 - popoverSize.width / 2 };

  // 四块遮罩围出高亮洞
  const maskPieces: React.CSSProperties[] = targetRect ? [
    { top: 0, left: 0, width: '100vw', height: Math.max(0, targetRect.top) }, // 上
    { top: targetRect.top + targetRect.height, left: 0, width: '100vw', height: Math.max(0, window.innerHeight - (targetRect.top + targetRect.height)) }, // 下
    { top: targetRect.top, left: 0, width: Math.max(0, targetRect.left), height: targetRect.height }, // 左
    { top: targetRect.top, left: targetRect.left + targetRect.width, width: Math.max(0, window.innerWidth - (targetRect.left + targetRect.width)), height: targetRect.height }, // 右
  ] : [{ top: 0, left: 0, width: '100vw', height: '100vh' }];

  return (
    <div className="fixed inset-0" style={{ zIndex: highLightZIndex }}>
      {/* 四块遮罩(点击空白处跳过) */}
      {maskPieces.map((style, i) => (
        <div
          key={i}
          className="fixed transition-all duration-200"
          style={{ ...style, backgroundColor: maskColor }}
          onClick={handleSkip}
        />
      ))}

      {/* 高亮描边 */}
      {targetRect && (
        <div
          className="fixed rounded-md pointer-events-none transition-all duration-200"
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
            boxShadow: '0 0 0 2px hsl(var(--primary)), 0 0 0 6px hsl(var(--primary) / 0.25)',
          }}
        />
      )}

      {/* 当不允许交互时,在洞上盖一层透明拦截层,阻止点中目标 */}
      {targetRect && !allowInteraction && (
        <div
          className="fixed"
          style={{ top: targetRect.top, left: targetRect.left, width: targetRect.width, height: targetRect.height }}
          onClick={handleSkip}
        />
      )}

      {/* 提示框 */}
      <div
        ref={popoverRef}
        className={cn('fixed max-w-sm w-80 bg-popover text-popover-foreground rounded-lg border shadow-xl', className)}
        style={{ top: pos.top, left: pos.left, zIndex: dialogZIndex }}
      >
        <div className="p-5">
          <div className="text-base font-semibold">{currentStep.title}</div>
          <div className="mt-2 text-sm text-muted-foreground">{currentStep.description}</div>
        </div>

        <div className="flex items-center justify-between px-5 pb-4">
          <div className="flex items-center gap-1.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === currentStepIndex ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30',
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {currentStep.skipable !== false && !isLast && (
              <Button variant="ghost" size="sm" onClick={handleSkip} className="text-muted-foreground">
                跳过
              </Button>
            )}
            <Button size="sm" onClick={handleNext} className="px-5">
              {currentStep.actionText || (isLast ? '完成' : '下一步')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
