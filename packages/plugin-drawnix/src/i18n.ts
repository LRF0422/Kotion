import { useTranslation } from "@kn/common";
import { useCallback } from "react";

const translations = {
  en: {
    "toolbar.addChild": "Add child (Tab)",
    "toolbar.addSibling": "Add sibling (Enter)",
    "toolbar.editNode": "Edit node (double-click)",
    "toolbar.deleteNode": "Delete node (Delete)",
    "toolbar.expandChildren": "Expand children",
    "toolbar.collapseChildren": "Collapse children",
    "toolbar.undo": "Undo (Ctrl+Z)",
    "toolbar.redo": "Redo (Ctrl+Y)",
    "toolbar.zoomOut": "Zoom out",
    "toolbar.resetZoom": "Reset zoom",
    "toolbar.zoomIn": "Zoom in",
    "toolbar.fitView": "Fit to canvas",
    "toolbar.fullscreen": "Enter fullscreen",
    "toolbar.exitFullscreen": "Exit fullscreen",
    "toolbar.changeLayout": "Change layout",
    "toolbar.layout": "Layout",
    "toolbar.layout.standard": "Standard",
    "toolbar.layout.right": "Right",
    "toolbar.layout.left": "Left",
    "toolbar.layout.downward": "Down",
    "toolbar.layout.upward": "Up",
  },
  zh: {
    "toolbar.addChild": "添加子节点 (Tab)",
    "toolbar.addSibling": "添加同级节点 (Enter)",
    "toolbar.editNode": "编辑节点 (双击)",
    "toolbar.deleteNode": "删除节点 (Delete)",
    "toolbar.expandChildren": "展开子节点",
    "toolbar.collapseChildren": "折叠子节点",
    "toolbar.undo": "撤销 (Ctrl+Z)",
    "toolbar.redo": "重做 (Ctrl+Y)",
    "toolbar.zoomOut": "缩小",
    "toolbar.resetZoom": "重置缩放",
    "toolbar.zoomIn": "放大",
    "toolbar.fitView": "适应画布",
    "toolbar.fullscreen": "全屏",
    "toolbar.exitFullscreen": "退出全屏",
    "toolbar.changeLayout": "切换布局",
    "toolbar.layout": "布局",
    "toolbar.layout.standard": "标准",
    "toolbar.layout.right": "向右",
    "toolbar.layout.left": "向左",
    "toolbar.layout.downward": "向下",
    "toolbar.layout.upward": "向上",
  },
} as const;

export type DrawnixI18nKey = keyof (typeof translations)["en"];

export function useDrawnixI18n() {
  const { i18n } = useTranslation();
  const language = i18n.language.startsWith("zh") ? "zh" : "en";
  const t = useCallback(
    (key: DrawnixI18nKey) => translations[language][key],
    [language],
  );

  return { t };
}
