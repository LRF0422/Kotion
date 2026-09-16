/**
 * Core Web Vitals 采集（无依赖版本）。
 *
 * - 只累积指标，在页面隐藏 / 卸载时通过 analytics 上报一次；
 * - 是否真正上报由 analytics.ts 的同意门控与 DNT 决定（本文件不感知同意）；
 * - 缺少 PerformanceObserver 等 API 时静默降级，任何异常都不影响页面。
 */

import { track } from './analytics';

/** LCP 条目（部分 TS lib 版本缺少 renderTime / loadTime 字段，这里显式声明）。 */
interface LargestContentfulPaintEntry extends PerformanceEntry {
  renderTime?: number;
  loadTime?: number;
}

/** 布局偏移条目（lib.dom 未内置）。 */
interface LayoutShiftEntry extends PerformanceEntry {
  value: number;
  hadRecentInput: boolean;
}

/** 事件计时条目：用 interactionId 区分真实交互。 */
interface EventTimingEntry extends PerformanceEntry {
  interactionId?: number;
}

interface NavigationTimingLike extends PerformanceEntry {
  responseStart?: number;
}

const metrics = { lcp: 0, cls: 0, inp: 0, ttfb: 0 };
const observers: PerformanceObserver[] = [];
let started = false;
let sent = false;

const observe = (type: string, handle: (entries: PerformanceEntry[]) => void): void => {
  try {
    const observer = new PerformanceObserver((list) => {
      try {
        handle(list.getEntries());
      } catch {
        /* 单个指标异常不影响其他指标 */
      }
    });
    observer.observe({ type, buffered: true });
    observers.push(observer);
  } catch {
    /* 该指标不被当前浏览器支持时跳过 */
  }
};

/** 注册性能观察器与上报时机，只应调用一次。 */
export function initVitals(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  try {
    if (typeof PerformanceObserver === 'function') {
      observe('largest-contentful-paint', (entries) => {
        for (const entry of entries) {
          const lcpEntry = entry as LargestContentfulPaintEntry;
          const value = lcpEntry.renderTime || lcpEntry.loadTime || 0;
          if (value > metrics.lcp) metrics.lcp = value;
        }
      });
      observe('layout-shift', (entries) => {
        for (const entry of entries) {
          const shift = entry as LayoutShiftEntry;
          if (!shift.hadRecentInput) metrics.cls += shift.value || 0;
        }
      });
      observe('event', (entries) => {
        for (const entry of entries) {
          const timing = entry as EventTimingEntry;
          const duration = timing.duration || 0;
          if (timing.interactionId && duration > metrics.inp) metrics.inp = duration;
        }
      });
    }
    if (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function') {
      const nav = performance.getEntriesByType('navigation')[0] as NavigationTimingLike | undefined;
      if (nav && typeof nav.responseStart === 'number' && typeof nav.startTime === 'number') {
        metrics.ttfb = nav.responseStart - nav.startTime;
      }
    }
  } catch {
    /* 浏览器不支持时静默降级 */
  }

  const report = (): void => {
    if (sent) return;
    sent = true;
    try {
      track('web_vitals', {
        lcp: Math.round(metrics.lcp),
        cls: Number(metrics.cls.toFixed(4)),
        inp: Math.round(metrics.inp),
        ttfb: Math.round(metrics.ttfb),
        path: window.location.pathname,
      });
    } catch {
      /* 上报失败不影响页面 */
    }
    for (const observer of observers) {
      try {
        observer.disconnect();
      } catch {
        /* 忽略 */
      }
    }
  };

  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') report();
  });
  window.addEventListener('pagehide', report);
}
