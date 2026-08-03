import { useTranslation } from "@kn/common";
import { HelpCircle, Trash2 } from "@kn/icon";
import { cn } from "@kn/ui";
import type { KatexOptions } from "katex";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  filterCommands,
  LATEX_SNIPPET_GROUPS,
  LatexCommand,
  matchCommandToken,
  resolveSnippet,
  snippetPreview,
} from "./util/latex-snippets";
import { renderLatex } from "./util/render-latex";

const KATEX_HELP_URL = "https://katex.org/docs/supported.html";
const TEXTAREA_MAX_HEIGHT = 200;
/** 不同分组的预览宽度差异较大，按分组给定列数 */
const GROUP_COLUMNS: Record<string, number> = { common: 6, multiline: 3, function: 5 };

export interface MathEditorPanelProps {
  latex: string;
  /** 是否块级（KaTeX displayMode） */
  display: boolean;
  katexOptions?: KatexOptions;
  /** 输入过程中的实时提交（由调用方做节流写入） */
  onChange: (latex: string) => void;
  onDisplayChange: (display: boolean) => void;
  /** 完成编辑 */
  onConfirm: () => void;
  /** 放弃本次编辑，恢复初始值 */
  onCancel: () => void;
  onDelete: () => void;
}

export const MathEditorPanel: React.FC<MathEditorPanelProps> = (props) => {
  const { latex, display, katexOptions, onChange, onDisplayChange, onConfirm, onCancel, onDelete } = props;
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(latex);
  const [group, setGroup] = useState(LATEX_SNIPPET_GROUPS[0]!.id);
  const [candidates, setCandidates] = useState<LatexCommand[]>([]);
  const [activeCandidate, setActiveCandidate] = useState(0);
  /** 补全 token 在文本中的起止位置 */
  const tokenRange = useRef<{ from: number; to: number }>({ from: 0, to: 0 });

  // 打开面板即聚焦输入区，光标落在末尾
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  // 外部（协同/撤销）改动同步进来，编辑中的本地输入优先
  useEffect(() => {
    if (document.activeElement !== textareaRef.current) {
      setValue(latex);
    }
  }, [latex]);

  useEffect(() => {
    onChange(value);
  }, [value]);

  // 多行输入：随内容增长，超过上限后内部滚动
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
  }, [value]);

  const preview = useMemo(() => renderLatex(value, display, katexOptions), [value, display, katexOptions]);

  const activeGroup = useMemo(
    () => LATEX_SNIPPET_GROUPS.find((it) => it.id === group) ?? LATEX_SNIPPET_GROUPS[0]!,
    [group]
  );

  // 部分片段（如 &、\end{}）无法单独渲染，回退为文本展示
  const groupPreviews = useMemo(
    () => activeGroup.snippets.map((snippet) => renderLatex(snippetPreview(snippet), false, katexOptions)),
    [activeGroup, katexOptions]
  );

  const candidatePreviews = useMemo(
    () => candidates.map((it) => renderLatex(it.preview, false, katexOptions)),
    [candidates, katexOptions]
  );

  const closeCandidates = useCallback(() => {
    setCandidates([]);
    setActiveCandidate(0);
  }, []);

  /** 在光标处插入片段，选中内容会被塞进占位位置 */
  const insertSnippet = useCallback((insert: string) => {
    const el = textareaRef.current;
    const from = el?.selectionStart ?? value.length;
    const to = el?.selectionEnd ?? value.length;
    const selected = value.slice(from, to);
    const { text, cursor } = resolveSnippet(insert);
    const fragment = selected ? text.slice(0, cursor) + selected + text.slice(cursor) : text;
    setValue(value.slice(0, from) + fragment + value.slice(to));
    const caret = from + cursor + selected.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
    closeCandidates();
  }, [value, closeCandidates]);

  /** 用补全项替换正在输入的命令 */
  const acceptCandidate = useCallback((command: LatexCommand) => {
    const el = textareaRef.current;
    const { from, to } = tokenRange.current;
    const { text, cursor } = resolveSnippet(command.insert);
    setValue(value.slice(0, from) + text + value.slice(to));
    const caret = from + cursor;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
    closeCandidates();
  }, [value, closeCandidates]);

  const syncCandidates = useCallback((next: string, caret: number) => {
    const token = matchCommandToken(next, caret);
    if (!token) {
      closeCandidates();
      return;
    }
    const matched = filterCommands(token.token);
    tokenRange.current = { from: token.from, to: caret };
    setCandidates(matched);
    setActiveCandidate(0);
  }, [closeCandidates]);

  const handleChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value;
    setValue(next);
    syncCandidates(next, event.target.selectionStart ?? next.length);
  }, [syncCandidates]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 弹出补全时优先处理候选列表的按键
    if (candidates.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveCandidate((prev) => (prev + 1) % candidates.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveCandidate((prev) => (prev - 1 + candidates.length) % candidates.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        acceptCandidate(candidates[activeCandidate] ?? candidates[0]!);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeCandidates();
        return;
      }
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key === "Enter") {
      // Ctrl/Cmd + Enter 完成；行内公式回车即完成，块级公式回车换行
      if (event.metaKey || event.ctrlKey || (!display && !event.shiftKey)) {
        event.preventDefault();
        onConfirm();
      }
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      insertSnippet("  ");
    }
  }, [candidates, activeCandidate, display, acceptCandidate, closeCandidates, insertSnippet, onCancel, onConfirm]);

  /** 工具条按钮不抢焦点，保证 Esc/Enter 仍由输入区处理 */
  const keepFocus = useCallback((event: React.MouseEvent) => event.preventDefault(), []);

  const columns = GROUP_COLUMNS[activeGroup.id] ?? 8;

  return (
    <div className="flex flex-col text-xs" onKeyDown={(event) => event.stopPropagation()}>
      <div className="flex h-7 items-center gap-1 border-b px-1.5">
        <div className="flex items-center rounded bg-muted p-[1px]">
          <button
            type="button"
            className={cn(
              "h-[18px] rounded px-1.5 text-[11px] transition-colors",
              !display ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
            onMouseDown={keepFocus}
            onClick={() => onDisplayChange(false)}
          >
            {t("editor.math.inline", "行内")}
          </button>
          <button
            type="button"
            className={cn(
              "h-[18px] rounded px-1.5 text-[11px] transition-colors",
              display ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
            onMouseDown={keepFocus}
            onClick={() => onDisplayChange(true)}
          >
            {t("editor.math.block", "块级")}
          </button>
        </div>
        <span className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            className="flex h-[18px] w-[18px] items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            title={t("editor.math.help", "语法帮助")}
            onMouseDown={keepFocus}
            onClick={() => window.open(KATEX_HELP_URL, "_blank")}
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="flex h-[18px] w-[18px] items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-destructive"
            title={t("editor.math.delete", "删除公式")}
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>

      <div className="max-h-[120px] overflow-auto bg-muted/30 px-2 py-1.5 text-center">
        {value.trim() ? (
          <span
            className="katex-preview inline-block max-w-full [&_.katex-display]:my-0"
            dangerouslySetInnerHTML={{ __html: preview.html }}
          />
        ) : (
          <span className="text-[11px] text-muted-foreground">{t("editor.math.previewEmpty", "预览区")}</span>
        )}
      </div>
      {preview.error && (
        <div className="truncate border-t px-2 py-1 text-[11px] text-destructive" title={preview.error}>
          {preview.error}
        </div>
      )}

      <div className="relative border-t">
        <textarea
          ref={textareaRef}
          value={value}
          spellCheck={false}
          autoComplete="off"
          rows={3}
          placeholder={t("editor.math.placeholder", "输入 LaTeX，支持多行，例如 \\frac{a}{b}")}
          className="block w-full resize-none bg-transparent px-2 py-1.5 font-mono text-xs leading-5 outline-none placeholder:text-muted-foreground"
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onClick={(event) => syncCandidates(value, event.currentTarget.selectionStart ?? 0)}
        />
        {candidates.length > 0 && (
          <div className="absolute left-1 right-1 top-full z-10 max-h-40 overflow-auto rounded-md border bg-popover py-0.5 shadow-md">
            {candidates.map((it, index) => (
              <button
                key={it.command}
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 px-2 py-0.5 text-left",
                  index === activeCandidate ? "bg-accent" : "hover:bg-accent/60"
                )}
                onMouseEnter={() => setActiveCandidate(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => acceptCandidate(it)}
              >
                <span className="font-mono text-[11px] text-foreground">{it.command}</span>
                {!candidatePreviews[index]?.error && (
                  <span
                    className="ml-auto text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: candidatePreviews[index]?.html ?? "" }}
                  />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-0.5 overflow-x-auto border-t px-1 py-1">
        {LATEX_SNIPPET_GROUPS.map((it) => (
          <button
            key={it.id}
            type="button"
            className={cn(
              "h-[18px] shrink-0 rounded px-1.5 text-[11px] transition-colors",
              it.id === activeGroup.id
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            onMouseDown={keepFocus}
            onClick={() => setGroup(it.id)}
          >
            {t(it.labelKey, it.fallback)}
          </button>
        ))}
      </div>
      <div
        className="grid max-h-[136px] gap-0.5 overflow-auto px-1 pb-1"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {activeGroup.snippets.map((snippet, index) => (
          <button
            key={`${activeGroup.id}-${snippet.insert}`}
            type="button"
            title={snippet.tip ?? snippet.insert}
            className="flex h-7 items-center justify-center overflow-hidden rounded px-0.5 hover:bg-accent"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => insertSnippet(snippet.insert)}
            {...(groupPreviews[index]?.error
              ? {
                children: (
                  <span className="truncate font-mono text-[10px] text-muted-foreground">
                    {snippet.tip ?? snippet.insert}
                  </span>
                ),
              }
              : { dangerouslySetInnerHTML: { __html: groupPreviews[index]?.html ?? "" } })}
          />
        ))}
      </div>

      <div className="border-t px-2 py-1 text-[10px] text-muted-foreground">
        {display
          ? t("editor.math.hintBlock", "Enter 换行 · Ctrl+Enter 完成 · Esc 取消 · 输入 \\ 唤起补全")
          : t("editor.math.hintInline", "Enter 完成 · Shift+Enter 换行 · Esc 取消 · 输入 \\ 唤起补全")}
      </div>
    </div>
  );
};
