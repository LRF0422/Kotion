import { EditorView } from '@tiptap/pm/view';

// 确保中文字体加载的辅助函数
async function ensureChineseFontLoaded(element: HTMLElement): Promise<void> {
    return new Promise((resolve) => {
        // 创建一个包含中文文本的测试元素来检查字体渲染
        const testElement = document.createElement('div');
        testElement.style.fontFamily = '"Microsoft YaHei", "SimHei", "STSong", "Hiragino Sans GB", "Heiti SC", sans-serif';
        testElement.style.fontSize = '16px';
        testElement.style.visibility = 'hidden';
        testElement.style.position = 'absolute';
        testElement.style.left = '-9999px';
        testElement.textContent = '测试中文';

        document.body.appendChild(testElement);

        // 等待字体加载
        setTimeout(() => {
            document.body.removeChild(testElement);
            resolve();
        }, 300);
    });
}

export interface PDFExportOptions {
    filename?: string;
    format?: 'a3' | 'a4' | 'a5' | 'letter' | 'legal';
    orientation?: 'portrait' | 'landscape';
    margin?: number;
    includeImages?: boolean;
    includeStyles?: boolean;
    quality?: number; // 画质设置，范围0-1
    watermark?: string; // 水印文字
    header?: string; // 页眉
    footer?: string; // 页脚
}

export class PDFExporter {
    static async export(view: EditorView, options: PDFExportOptions = {}) {
        const {
            filename = 'document.pdf',
            format = 'a4',
            orientation = 'portrait',
            margin = 10,
            includeImages = true,
            includeStyles = true,
            quality = 1.0,
            watermark = '',
            header = '',
            footer = ''
        } = options;

        try {
            // 获取 ProseMirror 编辑器元素 (实际内容所在)
            const proseMirrorElement = view.dom.closest('.ProseMirror') as HTMLElement;

            if (!proseMirrorElement) {
                console.error('Could not find ProseMirror editor element');
                return false;
            }

            const dependencyModules = Promise.all([
                import('jspdf'),
                import('html2canvas')
            ]);

            // 等待所有组件渲染完成
            // 强制布局重新计算，确保所有组件都已渲染
            await new Promise(resolve => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        setTimeout(resolve, 500); // 额外等待React组件完全渲染
                    });
                });
            });

            const [jsPDFModule, html2canvasModule] = await dependencyModules;
            const jsPDF = jsPDFModule.default;
            const html2canvas = html2canvasModule.default;

            // 直接使用 html2canvas 捕获原始元素，不进行克隆
            // 这样可以保留所有计算样式和布局
            const canvas = await html2canvas(proseMirrorElement, {
                scale: 2, // 降低到2x以提高性能和兼容性
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                logging: false,
                width: proseMirrorElement.offsetWidth,
                height: proseMirrorElement.scrollHeight,
                windowWidth: proseMirrorElement.offsetWidth,
                windowHeight: proseMirrorElement.scrollHeight,
                // 确保捕获所有样式
                foreignObjectRendering: false, // 禁用foreignObject以提高兼容性
                // 忽略某些元素
                ignoreElements: (element) => {
                    // 忽略固定定位的元素（如 ToC 按钮）
                    const style = window.getComputedStyle(element);
                    if (style.position === 'fixed') {
                        return true;
                    }
                    // 忽略按钮
                    if (element.tagName === 'BUTTON' && element.getAttribute('role') === 'button') {
                        return true;
                    }
                    return false;
                }
            });

            // 创建PDF文档
            const pdf = new jsPDF({
                orientation,
                unit: 'mm',
                format,
                compress: true
            });

            // 获取页面尺寸（毫米）
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();

            // 计算可用内容区域（减去边距）
            const contentWidth = pageWidth - (margin * 2);
            const contentHeight = pageHeight - (margin * 2);

            // Canvas 尺寸（像素）
            const imgWidth = canvas.width;
            const imgHeight = canvas.height;

            // 计算宽度缩放比例：将 canvas 宽度适配到 PDF 内容宽度
            // contentWidth (mm) * 3.78 = 对应的像素数（96 DPI时，1mm ≈ 3.78px）
            // 由于我们使用了 scale: 2，实际像素是 contentWidth * 3.78 * 2
            const scaleX = imgWidth / (contentWidth * 3.78 * 2);

            // 计算实际在 PDF 中的图片尺寸（毫米）
            const pdfImgWidth = contentWidth; // 图片宽度填满内容区域
            const pdfImgHeight = (imgHeight / scaleX) / 3.78; // 按比例计算高度

            // 使用 PNG 格式以获得更好的文本清晰度
            const pageImg = canvas.toDataURL('image/png', quality);

            // 处理多页内容
            let heightLeft = pdfImgHeight;
            let position = 0;
            let currentPage = 0;

            while (heightLeft > 0) {
                if (currentPage > 0) {
                    pdf.addPage();
                }

                // 计算当前页要显示的内容
                const yOffset = currentPage * contentHeight;

                // 添加页面内容
                pdf.addImage(
                    pageImg,
                    'PNG',
                    margin,                    // x position
                    margin - yOffset,          // y position (offset for multi-page)
                    pdfImgWidth,               // width in mm
                    pdfImgHeight,              // height in mm
                    undefined,
                    'FAST'
                );

                // 添加水印
                if (watermark) {
                    pdf.setFontSize(40);
                    pdf.setTextColor(200, 200, 200);
                    pdf.saveGraphicsState();
                    pdf.setGState(new (pdf as any)['GState']({ opacity: 0.3 }));
                    pdf.text(watermark, pageWidth / 2, pageHeight / 2, { align: 'center', angle: 45 });
                    pdf.restoreGraphicsState();
                }

                // 添加页眉和页脚
                if (header) {
                    pdf.setFontSize(12);
                    pdf.setTextColor(0, 0, 0);
                    pdf.text(header, pageWidth / 2, 10, { align: 'center' });
                }

                if (footer || currentPage > 0) {
                    pdf.setFontSize(10);
                    pdf.setTextColor(100, 100, 100);
                    pdf.text(`${currentPage + 1}`, pageWidth - 10, pageHeight - 10, { align: 'right' });

                    if (footer) {
                        pdf.text(footer, 10, pageHeight - 10);
                    }
                }

                heightLeft -= contentHeight;
                currentPage++;
            }

            // 保存PDF文件
            pdf.save(filename);

            return true;
        } catch (error) {
            console.error('Error exporting to PDF:', error);
            return false;
        }
    }
}