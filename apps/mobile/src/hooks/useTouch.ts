import { useRef, useEffect, useCallback } from 'react';

export interface TouchPosition {
  x: number;
  y: number;
}

export interface TouchState {
  startPos: TouchPosition | null;
  currentPos: TouchPosition | null;
  deltaX: number;
  deltaY: number;
  isTouch: boolean;
}

export interface UseTouchOptions {
  onTouchStart?: (pos: TouchPosition) => void;
  onTouchMove?: (state: TouchState) => void;
  onTouchEnd?: (state: TouchState) => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onLongPress?: () => void;
  swipeThreshold?: number;
  longPressDelay?: number;
}

export const useTouch = (options: UseTouchOptions = {}) => {
  const {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    onLongPress,
    swipeThreshold = 50,
    longPressDelay = 500,
  } = options;

  const stateRef = useRef<TouchState>({
    startPos: null,
    currentPos: null,
    deltaX: 0,
    deltaY: 0,
    isTouch: false,
  });

  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const getTouchPosition = (event: TouchEvent): TouchPosition => {
    const touch = event.touches[0] || event.changedTouches[0];
    return {
      x: touch.clientX,
      y: touch.clientY,
    };
  };

  const handleTouchStart = useCallback(
    (event: TouchEvent) => {
      const pos = getTouchPosition(event);
      stateRef.current = {
        startPos: pos,
        currentPos: pos,
        deltaX: 0,
        deltaY: 0,
        isTouch: true,
      };

      onTouchStart?.(pos);

      // Start long press timer
      if (onLongPress) {
        longPressTimerRef.current = setTimeout(() => {
          if (stateRef.current.isTouch) {
            onLongPress();
          }
        }, longPressDelay);
      }
    },
    [onTouchStart, onLongPress, longPressDelay]
  );

  const handleTouchMove = useCallback(
    (event: TouchEvent) => {
      if (!stateRef.current.startPos) return;

      const pos = getTouchPosition(event);
      const deltaX = pos.x - stateRef.current.startPos.x;
      const deltaY = pos.y - stateRef.current.startPos.y;

      stateRef.current = {
        ...stateRef.current,
        currentPos: pos,
        deltaX,
        deltaY,
      };

      onTouchMove?.(stateRef.current);

      // Cancel long press if moved
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }
    },
    [onTouchMove]
  );

  const handleTouchEnd = useCallback(
    (event: TouchEvent) => {
      if (!stateRef.current.startPos) return;

      // Clear long press timer
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      const { deltaX, deltaY } = stateRef.current;

      onTouchEnd?.(stateRef.current);

      // Detect swipe gestures
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        // Horizontal swipe
        if (Math.abs(deltaX) > swipeThreshold) {
          if (deltaX > 0) {
            onSwipeRight?.();
          } else {
            onSwipeLeft?.();
          }
        }
      } else {
        // Vertical swipe
        if (Math.abs(deltaY) > swipeThreshold) {
          if (deltaY > 0) {
            onSwipeDown?.();
          } else {
            onSwipeUp?.();
          }
        }
      }

      stateRef.current = {
        startPos: null,
        currentPos: null,
        deltaX: 0,
        deltaY: 0,
        isTouch: false,
      };
    },
    [onTouchEnd, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, swipeThreshold]
  );

  const bind = useCallback(
    (element: HTMLElement | null) => {
      if (!element) return;

      element.addEventListener('touchstart', handleTouchStart, { passive: true });
      element.addEventListener('touchmove', handleTouchMove, { passive: true });
      element.addEventListener('touchend', handleTouchEnd, { passive: true });

      return () => {
        element.removeEventListener('touchstart', handleTouchStart);
        element.removeEventListener('touchmove', handleTouchMove);
        element.removeEventListener('touchend', handleTouchEnd);

        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
        }
      };
    },
    [handleTouchStart, handleTouchMove, handleTouchEnd]
  );

  return { bind, state: stateRef.current };
};
