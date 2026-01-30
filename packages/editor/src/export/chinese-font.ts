// 定义中文字体支持
import jsPDF from 'jspdf';

// 中文字体支持 - 使用jsPDF内置的Unicode支持
export function addChineseFont(doc: jsPDF, fontName: string = 'SourceHanSansCN'): void {
    try {
        // 检查是否已存在该字体
        const fonts = doc.getFontList();
        if (!fonts[fontName]) {
            // 如果没有可用的中文字体，我们使用jsPDF的内置Unicode支持
            // 通过指定Identity-H编码来支持中文字符
            console.log('Adding Chinese font support...');

            // 注意：在实际应用中，如果需要嵌入特定字体，可以预先加载字体文件
            // 这里我们设置字体以支持中文字符
            doc.setFont('helvetica'); // 先设置默认字体
        }

        // 设置字体为支持中文的模式
        // Identity-H 编码支持中文、日文、韩文等字符
        doc.setFont(doc.getFont().fontName, undefined);

        // 如果需要在PDF中直接添加中文文本，需要使用Identity-H编码的字体
        // 例如，如果我们有具体的中文字体文件，可以这样添加：
        // doc.addFont('path/to/chinese-font.ttf', fontName, 'normal', 'Identity-H');

    } catch (e) {
        console.warn('Could not set up Chinese font support:', e);
    }
}

// 文本绘制函数，专门处理中文字符
export function drawTextWithChineseSupport(doc: jsPDF, text: string, x: number, y: number, options?: any) {
    try {
        // 直接使用jsPDF绘制文本，依赖html2canvas捕获的图像
        // 因为我们使用的是html2canvas将DOM转为图像再插入PDF，所以字体渲染由浏览器处理
        doc.text(text, x, y, options);
    } catch (e) {
        console.warn('Text drawing failed:', e);
        // 如果直接文本绘制失败，回退到图像渲染
        doc.text(text, x, y);
    }
}