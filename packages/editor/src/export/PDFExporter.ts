import { EditorView } from '@tiptap/pm/view';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

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
            // 获取编辑器内容元素
            const editorElement = view.dom.closest('.ProseMirror') as HTMLElement;
            if (!editorElement) {
                console.error('Could not find editor content element');
                return false;
            }

            // 创建临时克隆元素以进行样式处理
            const cloneElement = editorElement.cloneNode(true) as HTMLElement;

            // 设置克隆元素的样式以便于PDF导出
            cloneElement.style.position = 'fixed';
            cloneElement.style.left = '-9999px';
            cloneElement.style.top = '0';
            cloneElement.style.width = orientation === 'landscape' ? '16in' : '12in';
            cloneElement.style.height = 'auto';
            cloneElement.style.background = 'white';
            cloneElement.style.overflow = 'visible';
            cloneElement.style.transform = 'scale(0.8)';
            cloneElement.style.transformOrigin = 'top left';

            // 确保克隆元素包含中文字体样式
            const styleElement = document.createElement('style');
            styleElement.textContent = `
                * { 
                    font-family: "Microsoft YaHei", "SimSun", "STSong", "Hiragino Sans GB", sans-serif, serif !important; 
                }
            `;
            cloneElement.appendChild(styleElement);

            document.body.appendChild(cloneElement);

            // 如果需要包含样式，则复制页面中的CSS样式
            if (includeStyles) {
                const styles = document.querySelectorAll('style, link[rel="stylesheet"]');
                styles.forEach(style => {
                    if (style.tagName === 'LINK') {
                        const link = style.cloneNode(true) as HTMLLinkElement;
                        cloneElement.appendChild(link);
                    } else {
                        const styleClone = style.cloneNode(true) as HTMLStyleElement;
                        cloneElement.appendChild(styleClone);
                    }
                });
            }

            // 确保中文字体加载完成
            await ensureChineseFontLoaded(cloneElement);

            // 等待一段时间确保所有资源加载完成
            await new Promise(resolve => setTimeout(resolve, 500));

            // 使用html2canvas将DOM转换为图片
            const canvas = await html2canvas(cloneElement, {
                scale: 2, // 提高分辨率
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                logging: false,
                width: cloneElement.scrollWidth,
                height: cloneElement.scrollHeight,
            });

            // 移除临时克隆元素
            document.body.removeChild(cloneElement);

            // 创建PDF文档
            const pdf = new jsPDF({
                orientation,
                unit: 'mm',
                format,
                compress: true
            });

            // 获取页面尺寸
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();

            // 计算缩放比例
            const imgWidth = canvas.width;
            const imgHeight = canvas.height;
            const ratio = Math.min(imgWidth, imgHeight) / Math.min(pageWidth * 3.78, pageHeight * 3.78); // 3.78 = px per mm at 96 DPI
            const imgX = margin;
            const imgY = margin;

            let heightLeft = imgHeight / ratio;
            let position = margin;

            // 添加第一页
            const pageImg = canvas.toDataURL('image/jpeg', quality);

            // 处理多页内容
            let currentPage = 0;
            while (heightLeft >= 0) {
                // 添加页面内容
                pdf.addImage(pageImg, 'JPEG', imgX, position, imgWidth / ratio, imgHeight / ratio, undefined, 'FAST');

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

                heightLeft -= (pageHeight - margin * 2);
                currentPage++;

                if (heightLeft >= 0) {
                    position = heightLeft - imgHeight / ratio;
                    pdf.addPage();
                }
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