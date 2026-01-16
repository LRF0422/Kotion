import { EditorView } from '@tiptap/pm/view';
import { PDFExporter, PDFExportOptions } from './PDFExporter';

/**
 * 导出编辑器内容为PDF
 * @param view - Tiptap编辑器视图实例
 * @param options - PDF导出选项
 */
export async function exportToPDF(view: EditorView, options: PDFExportOptions = {}) {
  return await PDFExporter.export(view, options);
}

/**
 * @deprecated Use exportToPDF instead
 * 保持向后兼容性的旧方法
 */
function printHtml(dom: Element) {
  const style: string = Array.from(document.querySelectorAll('style, link')).reduce(
    (str, style) => str + style.outerHTML,
    ''
  );

  const content: string = style + dom.outerHTML;

  const iframe: HTMLIFrameElement = document.createElement('iframe');
  iframe.setAttribute('style', 'position: absolute; width: 0; height: 0; top: 0; left: 0;');
  document.body.appendChild(iframe);

  var head = iframe.getElementsByTagName('head')[0];

  // 获取所有的 <meta> 标签
  if (head) {
    var metaTags = head.getElementsByTagName('meta');

    // 遍历 <meta> 标签并更新 charset
    for (var i = 0; i < metaTags.length; i++) {
      var metaTag = metaTags[i];
      if (metaTag.getAttribute('charset')) {
        metaTag.setAttribute('charset', 'UTF-8');
        break;
      }
    }
  } else {
    const head = document.createElement('head');
    const meta = document.createElement('meta');
    meta.setAttribute('charset', 'gb2312');
    head.appendChild(meta);
    iframe.appendChild(head);
  }


  const frameWindow = iframe.contentWindow;
  const doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);

  if (doc) {
    doc.open();
    doc.writeln(content);
    doc.close();
  }

  if (frameWindow) {
    iframe.onload = function () {
      try {
        setTimeout(() => {
          frameWindow.focus();
          try {
            if (!frameWindow.document.execCommand('print', false)) {
              frameWindow.print();
            }
          } catch (e) {
            frameWindow.print();
          }
          frameWindow.close();
        }, 10);
      } catch (err) {
        console.error(err);
      }

      setTimeout(function () {
        document.body.removeChild(iframe);
      }, 100);
    };
  }
}

/**
 * @deprecated Use exportToPDF instead
 */
export function printEditorContent(view: EditorView) {
  const editorContent = view.dom.closest('.ProseMirror');
  if (editorContent) {
    printHtml(editorContent);
    return true;
  }
  return false;
}
