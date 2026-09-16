/**
 * 埋点事件字典（唯一事实来源）。
 *
 * - 事件名、分类、说明与属性 schema 集中在此，analytics.ts 只负责队列与上报；
 * - TrackProps 在这里重新声明（而不是从 analytics.ts 引入），避免循环依赖；
 * - 未知事件直接判失败，未知属性只作为 warning 提示，不阻塞上报。
 */

export type TrackProps = Record<string, string | number | boolean | null | undefined>;

export type PropType = 'string' | 'number' | 'boolean';

export interface PropSpec {
  type: PropType;
  required?: boolean;
  desc?: string;
}

export type EventCategory = 'NAV' | 'ENGAGEMENT' | 'CONVERSION' | 'FORM' | 'EXPERIMENT' | 'QUALITY';

export interface EventSpec {
  category: EventCategory;
  desc: string;
  props: Record<string, PropSpec>;
}

export const EVENTS = {
  pageview: {
    category: 'NAV',
    desc: '页面浏览',
    props: {
      path: { type: 'string', desc: '页面路径（不含查询参数）' },
      title: { type: 'string', desc: '页面标题' },
    },
  },
  section_view: {
    category: 'ENGAGEMENT',
    desc: '首屏区块曝光',
    props: {
      section: { type: 'string', required: true, desc: '区块标识' },
      index: { type: 'number', desc: '区块顺序' },
    },
  },
  scroll_depth: {
    category: 'ENGAGEMENT',
    desc: '滚动深度',
    props: {
      depth: { type: 'number', required: true, desc: '深度百分比，如 25 / 50 / 75 / 100' },
    },
  },
  cta_click: {
    category: 'CONVERSION',
    desc: 'CTA 点击',
    props: {
      location: { type: 'string', required: true, desc: '点击位置，如 hero / header' },
      target: { type: 'string', required: true, desc: '目标，如 demo / github' },
      variant: { type: 'string', desc: 'A/B 变体' },
    },
  },
  outbound_click: {
    category: 'CONVERSION',
    desc: '出站链接点击',
    props: {
      location: { type: 'string', required: true, desc: '点击位置' },
      target: { type: 'string', required: true, desc: '目标标识' },
      url: { type: 'string', desc: '目标地址' },
    },
  },
  template_use: {
    category: 'CONVERSION',
    desc: '使用模板',
    props: {
      templateId: { type: 'string', desc: '模板 ID' },
      templateName: { type: 'string', desc: '模板名称' },
      location: { type: 'string', desc: '入口位置' },
    },
  },
  plugin_install: {
    category: 'CONVERSION',
    desc: '安装插件',
    props: {
      pluginId: { type: 'string', desc: '插件 ID' },
      pluginName: { type: 'string', desc: '插件名称' },
      location: { type: 'string', desc: '入口位置' },
    },
  },
  form_start: {
    category: 'FORM',
    desc: '表单开始填写',
    props: {
      formId: { type: 'string', required: true, desc: '表单标识' },
      location: { type: 'string', desc: '入口位置' },
      fields: { type: 'number', desc: '字段数量' },
    },
  },
  form_submit: {
    category: 'FORM',
    desc: '表单提交',
    props: {
      formId: { type: 'string', required: true, desc: '表单标识' },
      location: { type: 'string', desc: '入口位置' },
      fields: { type: 'number', desc: '字段数量' },
    },
  },
  form_error: {
    category: 'FORM',
    desc: '表单错误',
    props: {
      formId: { type: 'string', required: true, desc: '表单标识' },
      errorCode: { type: 'string', desc: '错误码' },
      location: { type: 'string', desc: '入口位置' },
    },
  },
  subscribe: {
    category: 'FORM',
    desc: '订阅成功',
    props: {
      location: { type: 'string', required: true, desc: '入口位置' },
      confirmed: { type: 'boolean', desc: '是否二次确认' },
    },
  },
  experiment_exposure: {
    category: 'EXPERIMENT',
    desc: '实验曝光',
    props: {
      experiment: { type: 'string', required: true, desc: '实验标识' },
      variant: { type: 'string', required: true, desc: '实验分组' },
    },
  },
  experiment_conversion: {
    category: 'EXPERIMENT',
    desc: '实验转化',
    props: {
      experiment: { type: 'string', required: true, desc: '实验标识' },
      variant: { type: 'string', desc: '实验分组' },
      metric: { type: 'string', desc: '转化指标' },
    },
  },
  web_vitals: {
    category: 'QUALITY',
    desc: 'Core Web Vitals',
    props: {
      lcp: { type: 'number', desc: '最大内容绘制（ms）' },
      cls: { type: 'number', desc: '累计布局偏移' },
      inp: { type: 'number', desc: '交互到下次绘制（ms，近似值）' },
      ttfb: { type: 'number', desc: '首字节时间（ms）' },
      path: { type: 'string', desc: '页面路径' },
    },
  },
  consent_decided: {
    category: 'QUALITY',
    desc: '用户做出同意选择',
    props: {
      state: { type: 'string', required: true, desc: 'granted / denied' },
      region: { type: 'string', desc: '推断区域' },
    },
  },
  campaign_impression: {
    category: 'CONVERSION',
    desc: '运营位曝光',
    props: {
      promotionId: { type: 'string', required: true, desc: '运营位标识' },
      type: { type: 'string', desc: '运营位类型' },
      location: { type: 'string', desc: '位置' },
    },
  },
  campaign_dismiss: {
    category: 'CONVERSION',
    desc: '运营位关闭',
    props: {
      promotionId: { type: 'string', required: true, desc: '运营位标识' },
      type: { type: 'string', desc: '运营位类型' },
      location: { type: 'string', desc: '位置' },
    },
  },
  doc_search: {
    category: 'ENGAGEMENT',
    desc: '文档搜索',
    props: {
      query: { type: 'string', desc: '搜索词' },
      section: { type: 'string', desc: '搜索范围' },
      results: { type: 'number', desc: '结果数量' },
    },
  },
  doc_copy: {
    category: 'ENGAGEMENT',
    desc: '复制文档内容',
    props: {
      section: { type: 'string', desc: '所在区块' },
      blockType: { type: 'string', desc: '块类型，如 code / command' },
    },
  },
  not_found: {
    category: 'QUALITY',
    desc: '404 页面',
    props: {
      path: { type: 'string', required: true, desc: '未命中的路径' },
    },
  },
  referral_click: {
    category: 'CONVERSION',
    desc: '邀请码点击',
    props: {
      code: { type: 'string', required: true, desc: '邀请码' },
      location: { type: 'string', desc: '入口位置' },
    },
  },
} as const satisfies Record<string, EventSpec>;

export type EventName = keyof typeof EVENTS;

/** 运行时查表用的宽松视图（保留字面量键类型供 EventName 使用）。 */
const SPECS = EVENTS as Record<string, EventSpec>;

export const EVENT_NAMES = Object.keys(EVENTS) as EventName[];

const matchesType = (value: string | number | boolean, type: PropType): boolean => {
  if (type === 'string') return typeof value === 'string' || typeof value === 'number';
  if (type === 'number') return typeof value === 'number';
  return typeof value === 'boolean';
};

/**
 * 校验事件名与属性。
 * - 未注册事件：ok=false；
 * - 必填缺失 / 类型不符：ok=false；
 * - 未注册属性：只记入 warnings，不影响 ok。
 */
export function validateEvent(
  name: string,
  props?: TrackProps,
): { ok: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const spec = SPECS[name];
  if (!spec) {
    return { ok: false, errors: [`未注册事件: ${name}`], warnings };
  }

  const provided = props ?? {};
  for (const [key, propSpec] of Object.entries(spec.props)) {
    const value = provided[key];
    if (value === undefined || value === null) {
      if (propSpec.required) errors.push(`${name}.${key} 为必填属性`);
      continue;
    }
    if (!matchesType(value, propSpec.type)) {
      errors.push(`${name}.${key} 类型应为 ${propSpec.type}`);
    }
  }

  for (const key of Object.keys(provided)) {
    if (!Object.prototype.hasOwnProperty.call(spec.props, key)) {
      warnings.push(`未注册属性: ${name}.${key}`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
