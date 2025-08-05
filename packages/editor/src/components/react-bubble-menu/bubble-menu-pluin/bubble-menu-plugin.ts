import {
  Editor,
  isNodeSelection,
  isTextSelection,
  posToDOMRect
} from "@tiptap/core";
import { EditorState, Plugin, PluginKey } from "@tiptap/pm/state";
import { EditorView } from "@tiptap/pm/view";
import { autoPlacement, computePosition,hide } from '@floating-ui/dom';
import { fn } from "moment";
// import tippy, { Instance, Props } from "tippy.js";

export interface BubbleMenuPluginProps {
  pluginKey: PluginKey | string;
  editor: Editor;
  element: HTMLElement;
  tippyOptions?: Partial<any>;
  shouldShow?:
  | ((props: {
    editor: Editor;
    view: EditorView;
    state: EditorState;
    oldState?: EditorState;
    from: number;
    to: number;
  }) => boolean)
  | null;
}

export type BubbleMenuViewProps = BubbleMenuPluginProps & {
  view: EditorView;
};

export class BubbleMenuView {
  public editor: Editor;

  public element: HTMLElement;

  public view: EditorView;

  public preventHide = false;

  public tippy: any | undefined;

  public tippyOptions?: Partial<any>;

  public shouldShow: Exclude<BubbleMenuPluginProps["shouldShow"], null> = ({
    view,
    state,
    from,
    to
  }) => {
    const { doc, selection } = state;
    const { empty } = selection;

    // Sometime check for `empty` is not enough.
    // Doubleclick an empty paragraph returns a node size of 2.
    // So we check also for an empty text size.
    const isEmptyTextBlock =
      !doc.textBetween(from, to).length && isTextSelection(state.selection);

    if (!view.hasFocus() || empty || isEmptyTextBlock) {
      return false;
    }

    return true;
  };

  constructor({
    editor,
    element,
    view,
    tippyOptions = {},
    shouldShow
  }: BubbleMenuViewProps) {
    this.editor = editor;
    this.element = element;
    this.view = view;

    if (shouldShow) {
      this.shouldShow = shouldShow;
    }

    this.element.addEventListener("mousedown", this.mousedownHandler, {
      capture: true
    });
    this.view.dom.addEventListener("dragstart", this.dragstartHandler);
    this.editor.on("focus", this.focusHandler);
    this.editor.on("blur", this.blurHandler);
    this.tippyOptions = tippyOptions;
    // Detaches menu content from its current parent
    this.element.remove();
    this.element.style.visibility = "visible";
  }

  updateToolTip = (view: EditorView, oldState?: EditorState) => {

    const { element: editorElement } = this.editor.options;
    const editorIsAttached = !!editorElement?.parentElement;
    const { state, composing } = view;
    const { selection } = state;
    if (composing) return;
    const { ranges } = selection;
    const from = Math.min(...ranges.map(range => range.$from.pos));
    const to = Math.max(...ranges.map(range => range.$to.pos));

    if (this.tippy || !editorIsAttached) {
      return;
    }

    const getReferenceClientRect =
    this.tippyOptions?.getReferenceClientRect ||
      (() => {
        const editor = this.editor
      if (isNodeSelection(editor.state.selection)) {
        const node = editor.view.nodeDOM(from) as HTMLElement;

        if (node) {
          return node.getBoundingClientRect();
        }
      }

      return posToDOMRect(view, from, to);
      })
    
    
    const react = getReferenceClientRect()
      
    computePosition(editorElement as Element, this.element, {
      placement: "bottom",
      middleware: [autoPlacement()]
    }).then(({ middlewareData, x,y }) => {
      Object.assign(this.element.style, {
        top: react.top + "px",
        left: react.left + "px",
        bottom: react.bottom + "px",
        right: react.right + "px",
      });
    })
  }

  mousedownHandler = () => {
    this.preventHide = true;
  };

  dragstartHandler = () => {
    this.hide();
  };

  focusHandler = () => {
    // @ts-ignore
    setTimeout(() => this.update(this.editor.view));
  };

  blurHandler = ({ event }: { event: FocusEvent }) => {
    if (this.preventHide) {
      this.preventHide = false;

      return;
    }

    if (
      event?.relatedTarget &&
      this.element.parentNode?.contains(event.relatedTarget as Node)
    ) {
      return;
    }

    this.hide();
  };

  updateHandler = (view: EditorView, oldState?: EditorState) => {
    const { state, composing } = view;
    const { selection } = state;

    if (composing) return;
    const { ranges } = selection;
    const from = Math.min(...ranges.map(range => range.$from.pos));
    const to = Math.max(...ranges.map(range => range.$to.pos));

    const shouldShow = this.shouldShow?.({
      editor: this.editor,
      view,
      state,
      oldState,
      from,
      to
    });

    console.log('showld show', shouldShow);
    if (!shouldShow) {
      this.hide();
      return;
    }

    this.show(view,oldState);
  };

  createTooltip(view: EditorView, oldState?: EditorState) {
    

    // this.tippy = tippy(editorElement, {
    //   duration: 0,
    //   getReferenceClientRect: null,
    //   content: this.element,
    //   interactive: true,
    //   trigger: "manual",
    //   hideOnClick: "toggle",
    //   ...this.tippyOptions
    // });

    // maybe we have to hide tippy on its own blur event as well

      this.element.addEventListener(
        "blur",
        event => {
          this.blurHandler({ event });
        }
      );

  }

  update(view: EditorView, oldState?: EditorState) {
    setTimeout(() => {
      this.updateHandler(view, oldState);
    }, 0);
  }

  show(view: EditorView, oldState?: EditorState) {
    // this.tippy?.show();
    this.updateToolTip(view, oldState)
  }

  hide() {
    // this.tippy?.hide();
    this.element.style.visibility = 'hidden' 
  }

  destroy() {
    // this.tippy?.destroy();
    this.element.removeEventListener("mousedown", this.mousedownHandler, {
      capture: true
    });
    this.view.dom.removeEventListener("dragstart", this.dragstartHandler);
    this.editor.off("focus", this.focusHandler);
    this.editor.off("blur", this.blurHandler);
  }
}

export const BubbleMenuPlugin = (options: BubbleMenuPluginProps) => {
  return new Plugin({
    key:
      typeof options.pluginKey === "string"
        ? new PluginKey(options.pluginKey)
        : options.pluginKey,
    view: view => new BubbleMenuView({ view, ...options })
  });
};
