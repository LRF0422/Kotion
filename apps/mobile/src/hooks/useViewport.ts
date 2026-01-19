import { useState, useEffect } from 'react';

export interface ViewportSize {
  width: number;
  height: number;
  scrollY: number;
  scrollX: number;
}

export const useViewport = (): ViewportSize => {
  const [viewport, setViewport] = useState<ViewportSize>(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    scrollY: window.scrollY,
    scrollX: window.scrollX,
  }));

  useEffect(() => {
    const handleResize = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
        scrollY: window.scrollY,
        scrollX: window.scrollX,
      });
    };

    const handleScroll = () => {
      setViewport((prev) => ({
        ...prev,
        scrollY: window.scrollY,
        scrollX: window.scrollX,
      }));
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return viewport;
};

export const detectViewportSize = () => ({
  width: window.innerWidth,
  height: window.innerHeight,
});

export const isPortrait = () => window.innerHeight > window.innerWidth;

export const getViewportDimensions = () => ({
  width: window.innerWidth,
  height: window.innerHeight,
  devicePixelRatio: window.devicePixelRatio || 1,
});
