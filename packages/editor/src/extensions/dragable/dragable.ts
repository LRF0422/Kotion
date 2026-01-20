import ReactDOM from 'react-dom';

import { Extension } from '@tiptap/core';
import { safePos } from '../../utilities/position';
import { ActiveNode, selectAncestorNodeByDom } from '../../utilities/select-node-by-dom';
import { removePossibleTable } from '../../utilities/table';
import {
  NodeSelection,
  Plugin as PMPlugin,
  PluginKey as PMPluginKey,
  Selection,
  TextSelection,
} from '@tiptap/pm/state';
import { findParentNodeClosestToPos } from 'prosemirror-utils';
import { Decoration, DecorationSet, EditorView } from '@tiptap/pm/view';
import { createColumnsFromNodes } from '../columns/utilities';
import { Node } from '@tiptap/pm/model';

const DragablePluginKey = new PMPluginKey('dragable');

export const Dragable = Extension.create({
  name: 'dragable',

  // @ts-ignore
  addProseMirrorPlugins() {
    let editorView: EditorView;
    let dragHandleDOM: HTMLElement;
    let activeNode: ActiveNode | null;
    let activeSelection: Selection | null;
    let dragging = false;
    let mouseleaveTimer: any = null;

    // Column drop zone state
    let dropZoneIndicator: HTMLElement | null = null;
    let dropZoneTarget: { node: Node; pos: number; el: HTMLElement; side: 'left' | 'right' } | null = null;
    let columnDropTimer: any = null;
    const COLUMN_DROP_DELAY = 800; // ms to wait before showing column indicator

    const createDragHandleDOM = () => {
      const dom = document.createElement('div');
      dom.className = 'dragable';
      dom.draggable = true;
      dom.setAttribute('data-drag-handle', 'true');

      return dom;
    };

    const showDragHandleDOM = () => {
      dragHandleDOM?.classList?.add('show');
      dragHandleDOM?.classList?.remove('hide');
    };

    const hideDragHandleDOM = () => {
      dragHandleDOM?.classList?.remove('show');
      dragHandleDOM?.classList?.remove('active');
      dragHandleDOM?.classList?.add('hide');
    };

    const renderDragHandleDOM = (view: EditorView, referenceRectDOM: HTMLElement, activeNode: ActiveNode) => {
      const root = view.dom.parentElement;

      if (!root) return;

      const targetNodeRect = referenceRectDOM.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      const handleRect = dragHandleDOM.getBoundingClientRect();

      let offsetX = -5;

      if (referenceRectDOM.tagName === 'LI') {
        offsetX = referenceRectDOM.getAttribute('data-checked') ? -3 : -16;
      }

      const left = targetNodeRect.left - rootRect.left - handleRect.width + offsetX;
      const top = targetNodeRect.top - rootRect.top + handleRect.height / 2 + root.scrollTop;

      const offsetLeft = 0;

      dragHandleDOM.style.left = `${left + offsetLeft}px`;
      dragHandleDOM.style.top = `${top - 2}px`;

      showDragHandleDOM();
    };

    const handleMouseEnter = () => {
      if (!activeNode) return null;

      clearTimeout(mouseleaveTimer);
      showDragHandleDOM();
    };

    const handleMouseLeave = () => {
      if (!activeNode) return null;
      hideDragHandleDOM();
    };

    const handleMouseDown = () => {
      if (!activeNode) return null;

      if (NodeSelection.isSelectable(activeNode.node)) {
        const nodeSelection = NodeSelection.create(editorView.state.doc, activeNode.$pos.pos - activeNode.offset);
        editorView.dispatch(editorView.state.tr.setSelection(nodeSelection));
        editorView.focus();
        activeSelection = nodeSelection;
        return nodeSelection;
      }

      return null;
    };

    const handleMouseUp = () => {
      if (!dragging) return;

      dragging = false;
      activeSelection = null;
      activeNode = null;
      hideDropZoneIndicator();
    };

    // Column drop zone functions
    const createDropZoneIndicator = () => {
      const indicator = document.createElement('div');
      indicator.className = 'column-drop-indicator';
      return indicator;
    };

    const showDropZoneIndicator = (targetEl: HTMLElement, side: 'left' | 'right') => {
      if (!dropZoneIndicator) {
        dropZoneIndicator = createDropZoneIndicator();
        editorView.dom.parentElement?.appendChild(dropZoneIndicator);
      }

      const root = editorView.dom.parentElement!;
      const targetRect = targetEl.getBoundingClientRect();
      const rootRect = root.getBoundingClientRect();
      const scrollTop = root.scrollTop;

      const top = targetRect.top - rootRect.top + scrollTop;
      const left = targetRect.left - rootRect.left;
      const halfWidth = targetRect.width / 2;

      const isAlreadyVisible = dropZoneIndicator.style.display === 'block';
      const currentSide = dropZoneIndicator.classList.contains('left') ? 'left' : 'right';
      const isSwitchingSide = isAlreadyVisible && currentSide !== side;

      dropZoneIndicator.style.top = `${top}px`;
      dropZoneIndicator.style.height = `${targetRect.height}px`;
      dropZoneIndicator.style.width = `${halfWidth}px`;

      // Add transition class for smooth side switching
      if (isSwitchingSide) {
        dropZoneIndicator.classList.add('switching');
      }

      if (side === 'left') {
        dropZoneIndicator.style.left = `${left}px`;
        dropZoneIndicator.className = `column-drop-indicator left${isSwitchingSide ? ' switching' : ''}`;
      } else {
        dropZoneIndicator.style.left = `${left + halfWidth}px`;
        dropZoneIndicator.className = `column-drop-indicator right${isSwitchingSide ? ' switching' : ''}`;
      }

      dropZoneIndicator.style.display = 'block';

      // Remove switching class after animation
      if (isSwitchingSide) {
        setTimeout(() => {
          dropZoneIndicator?.classList.remove('switching');
        }, 200);
      }
    };

    const hideDropZoneIndicator = () => {
      if (dropZoneIndicator) {
        dropZoneIndicator.style.display = 'none';
      }
      dropZoneTarget = null;
      clearTimeout(columnDropTimer);
    };

    const detectDropSide = (event: DragEvent, targetEl: HTMLElement): 'left' | 'right' => {
      const rect = targetEl.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      return event.clientX < midX ? 'left' : 'right';
    };

    const handleDragStart = (event: DragEvent) => {
      dragging = true;
      if (event.dataTransfer && activeSelection) {
        const slice = activeSelection.content();
        event.dataTransfer.effectAllowed = 'copyMove';
        const { dom, text } = editorView.serializeForClipboard(slice);
        event.dataTransfer.clearData();
        event.dataTransfer.setData('text/html', dom.innerHTML);
        event.dataTransfer.setData('text/plain', text);
        event.dataTransfer.setDragImage(activeNode?.el as any, 0, 0);

        editorView.dragging = {
          slice,
          move: true,
        };
      }
    };

    return [
      new PMPlugin({
        key: DragablePluginKey,
        view: (view) => {
          if (view.editable) {
            dragHandleDOM = createDragHandleDOM();
            dragHandleDOM.addEventListener('mouseenter', handleMouseEnter);
            dragHandleDOM.addEventListener('mouseleave', handleMouseLeave);
            dragHandleDOM.addEventListener('mousedown', handleMouseDown);
            dragHandleDOM.addEventListener('mouseup', handleMouseUp);
            dragHandleDOM.addEventListener('dragstart', handleDragStart);
            view.dom.parentNode?.appendChild(dragHandleDOM);
            view.dom.parentElement?.setAttribute('style', "position: relative;");
          }

          return {
            update(view) {
              editorView = view;
            },
            destroy: () => {
              if (!dragHandleDOM) return;

              clearTimeout(mouseleaveTimer);
              clearTimeout(columnDropTimer);
              ReactDOM.unmountComponentAtNode(dragHandleDOM);
              dragHandleDOM.removeEventListener('mouseenter', handleMouseEnter);
              dragHandleDOM.removeEventListener('mouseleave', handleMouseLeave);
              dragHandleDOM.removeEventListener('mousedown', handleMouseDown);
              dragHandleDOM.removeEventListener('mouseup', handleMouseUp);
              dragHandleDOM.removeEventListener('dragstart', handleDragStart);
              dragHandleDOM.remove();
              dropZoneIndicator?.remove();
              dropZoneIndicator = null;
            },
          };
        },
        props: {
          handleDOMEvents: {
            dragover: (view, event: DragEvent) => {
              if (!view.editable || !dragging || !activeSelection) return false;

              const coords = { left: event.clientX, top: event.clientY };
              const pos = view.posAtCoords(coords);

              if (!pos || pos.pos === 0) {
                hideDropZoneIndicator();
                return false;
              }

              // Get target DOM element
              let targetDom: HTMLElement | null = event.target as HTMLElement;

              if (!targetDom || targetDom === view.dom) {
                hideDropZoneIndicator();
                return false;
              }

              // Walk up to find element node (skip text nodes)
              while (targetDom && targetDom.nodeType === 3) {
                targetDom = targetDom.parentElement;
              }

              if (!targetDom) {
                hideDropZoneIndicator();
                return false;
              }

              // Check if target is inside a column's content (not the column itself)
              // If so, skip column indicator to allow normal drag-drop into columns
              const columnContent = targetDom.closest('.node-column');
              if (columnContent) {
                // Check if we're hovering over content inside the column, not the column border
                const columnRect = columnContent.getBoundingClientRect();
                const isNearBorder = event.clientX < columnRect.left + 20 || event.clientX > columnRect.right - 20;
                if (!isNearBorder) {
                  // Inside column content - allow normal drop
                  hideDropZoneIndicator();
                  return false;
                }
              }

              // Find the nearest block-level element
              // Priority: react-renderer > table > common block tags
              let blockEl: HTMLElement | null = targetDom;
              while (blockEl && blockEl !== view.dom) {
                // Check for react-renderer (custom components like tables, images, etc.)
                if (blockEl.classList?.contains('react-renderer')) {
                  break;
                }
                // Check for table elements
                if (blockEl.tagName === 'TABLE' || blockEl.closest('table')?.parentElement === blockEl) {
                  break;
                }
                // Check for common block elements
                if (['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'UL', 'OL', 'LI', 'DIV'].includes(blockEl.tagName)) {
                  // Make sure it's a direct ProseMirror node, not a wrapper
                  if (blockEl.parentElement === view.dom ||
                    blockEl.parentElement?.classList?.contains('react-renderer') ||
                    blockEl.classList?.contains('node-column')) {
                    break;
                  }
                }
                blockEl = blockEl.parentElement;
              }

              if (!blockEl || blockEl === view.dom) {
                hideDropZoneIndicator();
                return false;
              }

              // Get the node info from DOM
              const result = selectAncestorNodeByDom(blockEl, view);
              if (!result) {
                hideDropZoneIndicator();
                return false;
              }

              // Skip doc and title only
              const skipTypes = ['doc', 'title', 'tableOfContents'];
              if (skipTypes.includes(result.node.type.name)) {
                hideDropZoneIndicator();
                return false;
              }

              // Don't drop on itself
              const draggedPos = (activeSelection as NodeSelection).from;
              const targetPos = result.$pos.pos - result.offset;
              if (targetPos === draggedPos) {
                hideDropZoneIndicator();
                return false;
              }

              // Don't drop on parent or child of dragged node
              const draggedNode = activeSelection.content().content.firstChild;
              if (draggedNode) {
                const draggedEnd = draggedPos + draggedNode.nodeSize;
                // Target is inside dragged node
                if (targetPos >= draggedPos && targetPos < draggedEnd) {
                  hideDropZoneIndicator();
                  return false;
                }
                // Dragged is inside target
                const targetEnd = targetPos + result.node.nodeSize;
                if (draggedPos >= targetPos && draggedPos < targetEnd) {
                  hideDropZoneIndicator();
                  return false;
                }
              }

              const side = detectDropSide(event, result.el);

              // Show indicator after delay
              if (!dropZoneTarget ||
                dropZoneTarget.pos !== targetPos ||
                dropZoneTarget.side !== side) {
                clearTimeout(columnDropTimer);
                dropZoneTarget = {
                  node: result.node,
                  pos: targetPos,
                  el: result.el,
                  side
                };
                columnDropTimer = setTimeout(() => {
                  if (dropZoneTarget) {
                    showDropZoneIndicator(dropZoneTarget.el, dropZoneTarget.side);
                  }
                }, COLUMN_DROP_DELAY);
              }

              return false;
            },
            drop: (view, event: DragEvent) => {
              if (!view.editable || !dragHandleDOM) return false;
              if (!activeSelection) return false;

              // Always clear the column drop timer on any drop
              clearTimeout(columnDropTimer);

              // Check if we should create columns
              if (dropZoneTarget && dropZoneIndicator?.style.display === 'block') {
                event.preventDefault();
                event.stopPropagation();

                try {
                  const draggedSlice = activeSelection.content();
                  const draggedNode = draggedSlice.content.firstChild;

                  if (!draggedNode) {
                    console.warn('No dragged node found');
                    hideDropZoneIndicator();
                    return false;
                  }

                  const draggedContent = draggedNode.toJSON();
                  const targetContent = dropZoneTarget.node.toJSON();

                  const leftContent = dropZoneTarget.side === 'left' ? draggedContent : targetContent;
                  const rightContent = dropZoneTarget.side === 'left' ? targetContent : draggedContent;

                  const columnsNode = createColumnsFromNodes(
                    view.state.schema,
                    leftContent,
                    rightContent
                  );

                  const tr = view.state.tr;
                  const draggedPos = (activeSelection as NodeSelection).from;
                  const targetPos = dropZoneTarget.pos;

                  // Delete dragged node first if it's before target
                  if (draggedPos < targetPos) {
                    tr.delete(draggedPos, draggedPos + draggedNode.nodeSize);
                    // Adjust target position after deletion
                    const adjustedTargetPos = tr.mapping.map(targetPos);
                    const targetNode = tr.doc.nodeAt(adjustedTargetPos);
                    if (targetNode) {
                      tr.replaceWith(adjustedTargetPos, adjustedTargetPos + targetNode.nodeSize, columnsNode);
                    }
                  } else {
                    // Replace target first, then delete dragged
                    tr.replaceWith(targetPos, targetPos + dropZoneTarget.node.nodeSize, columnsNode);
                    const adjustedDraggedPos = tr.mapping.map(draggedPos);
                    tr.delete(adjustedDraggedPos, adjustedDraggedPos + draggedNode.nodeSize);
                  }

                  view.dispatch(tr);
                } catch (err) {
                  console.error('Error creating columns:', err);
                }

                hideDropZoneIndicator();
                activeSelection = null;
                activeNode = null;
                dragging = false;

                return true;
              }

              const eventPos = view.posAtCoords({
                left: event.clientX,
                top: event.clientY,
              });

              setTimeout(() => {
                if (activeSelection) {
                  [
                    'ProseMirror-selectednode',
                    'ProseMirror-selectedblocknode-dragable',
                    'ProseMirror-selectedblocknode-normal',
                  ].forEach((cls) => {
                    (view.dom as HTMLElement).querySelectorAll(`.${cls}`).forEach((dom) => dom.classList.remove(cls));
                  });
                  const noneSelection = new TextSelection(
                    view.state.doc.resolve(safePos(view.state, eventPos?.pos ?? 0))
                  );
                  view.dispatch(view.state.tr.setSelection(noneSelection));
                  this.editor.commands.blur();

                  activeSelection = null;
                  activeNode = null;
                }
              }, 100);

              if (!eventPos) {
                hideDropZoneIndicator();
                return true;
              }

              const maybeTitle = findParentNodeClosestToPos(
                view.state.doc.resolve(safePos(this.editor.state, eventPos.pos)),
                (node) => node.type.name === 'title'
              );

              // 不允许在 title 处放置
              if (eventPos.pos === 0 || maybeTitle) {
                hideDropZoneIndicator();
                return true;
              }

              if (dragging) {
                const tr = removePossibleTable(view, event);

                dragging = false;
                hideDropZoneIndicator();

                if (tr) {
                  view.dispatch(tr);
                  event.preventDefault();
                  return true;
                }
              }

              hideDropZoneIndicator();
              return false;
            },
            mousemove: (view, event) => {
              if (!view.editable || !dragHandleDOM) return false;

              const coords = { left: event.clientX, top: event.clientY };
              const pos = view.posAtCoords(coords);

              if (!pos || !pos.pos) return false;

              let dom: any = view.nodeDOM(pos.pos) || view.domAtPos(pos.pos)?.node || event.target;

              const maybeTaskItemOrListItem = findParentNodeClosestToPos(view.state.doc.resolve(pos.pos), (node) =>
                ['taskItem', 'listItem'].some((name) => name === node.type.name)
              );

              if (!dom) {
                if (dragging) return false;
                hideDragHandleDOM();
                return false;
              }

              while (dom && dom.nodeType === 3) {
                dom = dom.parentElement;
              }

              // 选中列表项
              if (maybeTaskItemOrListItem) {
                while (dom && dom.tagName !== 'LI') {
                  dom = dom.parentElement;
                }
              }

              if (dom.tagName === 'LI') {
                if (dom?.parentElement?.childElementCount === 1) {
                  return false;
                }
              }

              // 不允许选中整个列表
              if (dom.tagName === 'UL' || dom.tagName === 'OL') {
                return false;
              }

              try {
                let maybeReactRenderer: HTMLElement | null = dom;

                while (maybeReactRenderer && !maybeReactRenderer.classList?.contains('react-renderer')) {
                  maybeReactRenderer = maybeReactRenderer.parentElement;
                }

                if (maybeReactRenderer && !maybeReactRenderer?.classList?.contains('node-columns')) {
                  dom = maybeReactRenderer;
                }
              } catch (e) {
                //
              }

              if (!(dom instanceof Element)) {
                if (dragging) return false;
                hideDragHandleDOM();
                return false;
              }

              const result = selectAncestorNodeByDom(dom, view);

              if (
                !result ||
                result.node.type.name === 'doc' ||
                result.node.type.name === 'title' ||
                result.node.type.name === 'tableOfContents'
              ) {
                if (dragging) return false;
                hideDragHandleDOM();
                return false;
              }

              activeNode = result;
              renderDragHandleDOM(view, result.el, activeNode);
              return false;
            },
            keydown: () => {
              if (!editorView.editable || !dragHandleDOM) return false;
              hideDragHandleDOM();
              return false;
            },
            mouseleave: () => {
              clearTimeout(mouseleaveTimer);
              mouseleaveTimer = setTimeout(() => {
                hideDragHandleDOM();
              }, 400);
              return false;
            },
            dragleave: (view, event: DragEvent) => {
              // Hide indicator when leaving the editor
              if (event.target === view.dom || !view.dom.contains(event.relatedTarget as any)) {
                hideDropZoneIndicator();
              }
              return false;
            },
            dragend: () => {
              hideDropZoneIndicator();
              dragging = false;
              return false;
            },
          },
        },
      }),
      new PMPlugin({
        key: new PMPluginKey('AncestorDragablePluginFocusKey'),
        props: {
          decorations(state) {
            const usingActiveSelection = !!activeSelection;
            const selection = state.selection;

            if (selection instanceof NodeSelection) {
              const { from, to } = selection;

              return DecorationSet.create(state.doc, [
                Decoration.node(safePos(state, from), safePos(state, to), {
                  class: usingActiveSelection
                    ? 'ProseMirror-selectedblocknode-dragable'
                    : 'ProseMirror-selectedblocknode-normal',
                }),
              ]);
            }

            return DecorationSet.empty;
          },
        },
      }),
    ];
  },
});
