package com.knowledge.filecenter.document;

import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.junit.jupiter.api.Test;

class OoxmlTextExtractorTest {

    @Test
    void extractsDocxParagraphText() throws Exception {
        byte[] docx = zip(
                "word/document.xml",
                "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
                        + "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">"
                        + "<w:body>"
                        + "<w:p><w:r><w:t>Hello</w:t></w:r><w:r><w:t xml:space=\"preserve\"> World</w:t></w:r></w:p>"
                        + "<w:p><w:r><w:t>Second paragraph</w:t></w:r></w:p>"
                        + "</w:body></w:document>");

        String text = OoxmlTextExtractor.extract(docx, "docx");

        assertTrue(text.contains("Hello World"), text);
        assertTrue(text.contains("Second paragraph"), text);
    }

    @Test
    void extractsDocxTabsAndBreaks() throws Exception {
        byte[] docx = zip(
                "word/document.xml",
                "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">"
                        + "<w:body><w:p><w:r><w:t>A</w:t><w:tab/><w:t>B</w:t><w:br/><w:t>C</w:t></w:r></w:p></w:body>"
                        + "</w:document>");

        String text = OoxmlTextExtractor.extract(docx, "docx");

        assertTrue(text.contains("A\tB"), text);
        assertTrue(text.contains("B\nC"), text);
    }

    @Test
    void extractsPptxSlidesInOrder() throws Exception {
        byte[] pptx = zipAll(
                new String[] { "ppt/slides/slide1.xml", "ppt/slides/slide2.xml" },
                new String[] {
                        "<p:sld xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\" xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\"><p:cSld><a:p><a:r><a:t>First slide</a:t></a:r></a:p></p:cSld></p:sld>",
                        "<p:sld xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\" xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\"><p:cSld><a:p><a:r><a:t>Second slide</a:t></a:r></a:p></p:cSld></p:sld>",
                });

        String text = OoxmlTextExtractor.extract(pptx, "pptx");

        assertTrue(text.indexOf("First slide") < text.indexOf("Second slide"), text);
    }

    @Test
    void resolvesXlsxSharedStrings() throws Exception {
        byte[] xlsx = zipAll(
                new String[] { "xl/sharedStrings.xml", "xl/worksheets/sheet1.xml" },
                new String[] {
                        "<sst xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">"
                                + "<si><t>Name</t></si><si><t>Age</t></si></sst>",
                        "<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\">"
                                + "<sheetData>"
                                + "<row r=\"1\"><c r=\"A1\" t=\"s\"><v>0</v></c><c r=\"B1\" t=\"s\"><v>1</v></c></row>"
                                + "<row r=\"2\"><c r=\"A2\" t=\"inlineStr\"><is><t>Alice</t></is></c><c r=\"B2\"><v>30</v></c></row>"
                                + "</sheetData></worksheet>",
                });

        String text = OoxmlTextExtractor.extract(xlsx, "xlsx");

        assertTrue(text.contains("Name\tAge"), text);
        assertTrue(text.contains("Alice\t30"), text);
    }

    @Test
    void returnsNullForUnsupportedSuffix() {
        assertNull(OoxmlTextExtractor.extract(new byte[] { 1, 2, 3 }, "pdf"));
    }

    private static byte[] zip(String name, String content) throws Exception {
        return zipAll(new String[] { name }, new String[] { content });
    }

    private static byte[] zipAll(String[] names, String[] contents) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(output)) {
            for (int index = 0; index < names.length; index++) {
                zip.putNextEntry(new ZipEntry(names[index]));
                zip.write(contents[index].getBytes(StandardCharsets.UTF_8));
                zip.closeEntry();
            }
        }
        return output.toByteArray();
    }
}
