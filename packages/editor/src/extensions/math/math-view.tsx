import { useTranslation } from "@kn/common";
import { cn, Popover, PopoverContent, PopoverTrigger } from "@kn/ui";
import { NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper } from "@tiptap/react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { updateEvaluation } from "./latex-evaluation/update-evaluation";
import { MathEditorPanel } from "./math-editor-panel";
import { generateID } from "./util/generate-id";
import { MathExtensionOption } from "./util/options";
import { renderLatex } from "./util/render-latex";

const COMMIT_DELAY = 300;

export const MathView: React.FC<NodeViewProps> = (props) => {
  const { node, editor, extension, updateAttributes, deleteNode, selected } = props;
  const { t } = useTranslation();
  const options = extension.options as MathExtensionOption;
  const latex: string = node.attrs.latex ?? "";
  const display = node.attrs.display === "yes";
  const showEvalResult = node.attrs.evaluate === "yes";
  const isEditable = editor.isEditable;

  const [open, setOpen] = useState(false);
  /** 打开编辑面板时的取值，用于 Esc 撤销 */
  const snapshot = useRef({ latex, display });
  /** 最新草稿与节流提交定时器 */
  const draft = useRef(latex);
  const timer = useRef<number | undefined>(undefined);
  /** 节点已删除时不再回写属性 */
  const removed = useRef(false);

  const rendered = useMemo(() => renderLatex(latex, display, options.katexOptions), [latex, display, options.katexOptions]);

  const clearTimer = useCallback(() => {
    if (timer.current !== undefined) {
      window.clearTimeout(timer.current);
      timer.current = undefined;
    }
  }, []);

  // 卸载前把未提交的草稿写回，避免输入丢失
  useEffect(() => () => {
    if (timer.current !== undefined) {
      window.clearTimeout(timer.current);
      if (!removed.current) {
        updateAttributes({ latex: draft.current });
      }
    }
  }, []);

  const removeNode = useCallback(() => {
    if (removed.current) {
      return;
    }
    clearTimer();
    removed.current = true;
    deleteNode();
  }, [clearTimer, deleteNode]);

  const handleChange = useCallback((next: string) => {
    draft.current = next;
    clearTimer();
    // 与当前属性一致时不提交，避免面板初始化就把文档标脏
    if (next === latex) {
      return;
    }
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      updateAttributes({ latex: draft.current });
    }, COMMIT_DELAY);
  }, [clearTimer, latex, updateAttributes]);

  const closePanel = useCallback(() => {
    setOpen(false);
    // 焦点交还编辑器，光标落在公式之后
    requestAnimationFrame(() => editor.commands.focus());
  }, [editor]);

  const handleConfirm = useCallback(() => {
    if (removed.current) {
      return;
    }
    clearTimer();
    if (!draft.current.trim()) {
      removeNode();
      return;
    }
    if (draft.current !== latex) {
      updateAttributes({ latex: draft.current });
    }
    closePanel();
  }, [clearTimer, closePanel, latex, removeNode, updateAttributes]);

  const handleCancel = useCallback(() => {
    if (removed.current) {
      return;
    }
    clearTimer();
    if (!snapshot.current.latex.trim()) {
      removeNode();
      return;
    }
    draft.current = snapshot.current.latex;
    if (snapshot.current.latex !== latex || snapshot.current.display !== display) {
      updateAttributes({
        latex: snapshot.current.latex,
        display: snapshot.current.display ? "yes" : "no",
      });
    }
    closePanel();
  }, [clearTimer, closePanel, display, latex, removeNode, updateAttributes]);

  const handleOpenChange = useCallback((next: boolean) => {
    if (next) {
      snapshot.current = { latex, display };
      draft.current = latex;
      setOpen(true);
      return;
    }
    handleConfirm();
  }, [display, handleConfirm, latex]);

  // 新插入的空公式直接进入编辑态
  useEffect(() => {
    if (isEditable && !latex) {
      snapshot.current = { latex: "", display };
      draft.current = "";
      setOpen(true);
    }
  }, []);

  const evaluationRef = useRef<HTMLSpanElement>(null);
  const evaluationId = useRef(generateID());
  useEffect(() => {
    if (!options.evaluation || !evaluationRef.current) {
      return;
    }
    const id = evaluationId.current;
    const storage = editor.storage.inlineMath;
    const result = updateEvaluation(latex, id, evaluationRef.current, showEvalResult, storage);
    return () => {
      result?.variablesUsed?.forEach((variable: string) => {
        const listeners = storage.variableListeners[variable] ?? [];
        storage.variableListeners[variable] = listeners.filter((it: { id: string }) => it.id !== id);
      });
    };
  }, [latex, showEvalResult, options.evaluation, editor]);

  const formula = (
    <span
      className={cn(
        "tiptap-math latex rounded px-0.5 align-middle",
        isEditable && "cursor-pointer hover:bg-accent/60",
        selected && "bg-accent",
        open && "bg-accent",
        display && "block w-full py-1 text-center",
        !latex && "text-muted-foreground"
      )}
      onMouseDown={(event) => event.stopPropagation()}
      {...(latex
        ? { dangerouslySetInnerHTML: { __html: rendered.html } }
        : { children: <span className="text-xs">{t("editor.math.empty", "点击输入公式")}</span> })}
    />
  );

  return (
    <NodeViewWrapper
      as="span"
      className={cn("math-node", display && "block")}
      contentEditable={false}
      suppressContentEditableWarning
    >
      {isEditable ? (
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>{formula}</PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={6}
            className="w-[380px] overflow-hidden p-0"
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
            // Radix 在 document 捕获阶段监听 Esc，这里交还给面板处理（先关补全列表，再取消编辑）
            onEscapeKeyDown={(event) => event.preventDefault()}
          >
            <MathEditorPanel
              latex={latex}
              display={display}
              katexOptions={options.katexOptions}
              onChange={handleChange}
              onDisplayChange={(next) => updateAttributes({ display: next ? "yes" : "no" })}
              onConfirm={handleConfirm}
              onCancel={handleCancel}
              onDelete={removeNode}
            />
          </PopoverContent>
        </Popover>
      ) : (
        formula
      )}
      {options.evaluation && (
        <span
          ref={evaluationRef}
          className="tiptap-math result katex cursor-pointer"
          title={t("editor.math.toggleResult", "点击切换计算结果")}
          onClick={(event) => {
            event.stopPropagation();
            updateAttributes({ evaluate: showEvalResult ? "no" : "yes" });
          }}
        />
      )}
    </NodeViewWrapper>
  );
};
