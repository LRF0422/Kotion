package com.knowledge.filecenter.document;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

/**
 * Extracts plain text from Office Open XML files (.docx, .pptx, .xlsx) using only the JDK.
 * <p>
 * These formats are zip archives whose parts are XML, so plain-text extraction means
 * reading the relevant part and collecting its text nodes. This avoids pulling a heavy
 * document-parsing dependency into the service.
 */
public final class OoxmlTextExtractor {

    private static final String WORD_DOCUMENT = "word/document.xml";
    private static final String PPT_SLIDE_PREFIX = "ppt/slides/slide";
    private static final String XLSX_SHARED_STRINGS = "xl/sharedStrings.xml";
    private static final String XLSX_SHEET_PREFIX = "xl/worksheets/sheet";
    private static final String XML_SUFFIX = ".xml";
    private static final int MAX_PART_BYTES = 32 * 1024 * 1024;

    private OoxmlTextExtractor() {
    }

    /**
     * @param bytes  the raw file content
     * @param suffix the lower-case file extension
     * @return extracted plain text (possibly empty), or {@code null} when the suffix is
     *         unsupported or the archive could not be read
     */
    public static String extract(byte[] bytes, String suffix) {
        if (bytes == null || bytes.length == 0 || suffix == null) {
            return null;
        }
        try {
            Map<String, byte[]> parts = readParts(bytes);
            switch (suffix.toLowerCase(Locale.ROOT)) {
                case "docx":
                    return extractWord(parts);
                case "pptx":
                    return extractPowerPoint(parts);
                case "xlsx":
                    return extractExcel(parts);
                default:
                    return null;
            }
        } catch (Exception e) {
            return null;
        }
    }

    private static String extractWord(Map<String, byte[]> parts) {
        byte[] document = parts.get(WORD_DOCUMENT);
        if (document == null) {
            return null;
        }
        return normalize(collectDocumentText(document));
    }

    private static String extractPowerPoint(Map<String, byte[]> parts) {
        List<String> slides = matching(parts, PPT_SLIDE_PREFIX, XML_SUFFIX);
        if (slides.isEmpty()) {
            return null;
        }
        Collections.sort(slides, OoxmlTextExtractor::compareByLengthThenName);
        StringBuilder text = new StringBuilder();
        for (String slide : slides) {
            String slideText = collectDocumentText(parts.get(slide));
            if (slideText == null || slideText.trim().isEmpty()) {
                continue;
            }
            if (text.length() > 0) {
                text.append("\n\n");
            }
            text.append(slideText);
        }
        return normalize(text.toString());
    }

    private static String extractExcel(Map<String, byte[]> parts) {
        List<String> sharedStrings = parseSharedStrings(parts.get(XLSX_SHARED_STRINGS));
        List<String> sheets = matching(parts, XLSX_SHEET_PREFIX, XML_SUFFIX);
        Collections.sort(sheets, OoxmlTextExtractor::compareByLengthThenName);
        if (sheets.isEmpty()) {
            return sharedStrings.isEmpty() ? "" : normalize(join(sharedStrings, "\n"));
        }
        StringBuilder text = new StringBuilder();
        for (String sheet : sheets) {
            String sheetText = parseSheet(parts.get(sheet), sharedStrings);
            if (sheetText == null || sheetText.isEmpty()) {
                continue;
            }
            if (text.length() > 0) {
                text.append("\n\n");
            }
            text.append(sheetText);
        }
        return normalize(text.toString());
    }

    private static List<String> parseSharedStrings(byte[] xml) {
        List<String> values = new ArrayList<>();
        Document document = parse(xml);
        if (document == null) {
            return values;
        }
        NodeList items = document.getElementsByTagNameNS("*", "si");
        for (int index = 0; index < items.getLength(); index++) {
            values.add(collectElementText(items.item(index)).trim());
        }
        return values;
    }

    private static String parseSheet(byte[] xml, List<String> sharedStrings) {
        Document document = parse(xml);
        if (document == null) {
            return null;
        }
        StringBuilder text = new StringBuilder();
        NodeList rows = document.getElementsByTagNameNS("*", "row");
        for (int rowIndex = 0; rowIndex < rows.getLength(); rowIndex++) {
            List<String> cellValues = new ArrayList<>();
            NodeList children = rows.item(rowIndex).getChildNodes();
            for (int childIndex = 0; childIndex < children.getLength(); childIndex++) {
                Node child = children.item(childIndex);
                if (child.getNodeType() == Node.ELEMENT_NODE && "c".equals(localName(child))) {
                    cellValues.add(resolveCell((Element) child, sharedStrings));
                }
            }
            text.append(join(cellValues, "\t")).append('\n');
        }
        return text.toString();
    }

    private static String resolveCell(Element cell, List<String> sharedStrings) {
        String type = cell.getAttribute("t");
        if ("s".equals(type)) {
            NodeList values = cell.getElementsByTagNameNS("*", "v");
            if (values.getLength() == 0) {
                return "";
            }
            try {
                int sharedIndex = Integer.parseInt(values.item(0).getTextContent().trim());
                return sharedIndex >= 0 && sharedIndex < sharedStrings.size() ? sharedStrings.get(sharedIndex) : "";
            } catch (NumberFormatException e) {
                return "";
            }
        }
        if ("inlineStr".equals(type)) {
            return collectElementText(cell).trim();
        }
        NodeList values = cell.getElementsByTagNameNS("*", "v");
        return values.getLength() == 0 ? "" : values.item(0).getTextContent().trim();
    }

    private static String collectDocumentText(byte[] xml) {
        Document document = parse(xml);
        return document == null ? null : collectElementText(document.getDocumentElement());
    }

    private static String collectElementText(Node node) {
        StringBuilder text = new StringBuilder();
        collect(node, text);
        return text.toString();
    }

    private static void collect(Node node, StringBuilder text) {
        if (node == null) {
            return;
        }
        short type = node.getNodeType();
        if (type == Node.TEXT_NODE || type == Node.CDATA_SECTION_NODE) {
            text.append(node.getNodeValue());
            return;
        }
        if (type != Node.ELEMENT_NODE) {
            return;
        }
        String name = localName(node);
        if ("t".equals(name)) {
            text.append(node.getTextContent());
            return;
        }
        if ("tab".equals(name)) {
            text.append('\t');
            return;
        }
        if ("br".equals(name) || "cr".equals(name)) {
            text.append('\n');
            return;
        }
        NodeList children = node.getChildNodes();
        for (int index = 0; index < children.getLength(); index++) {
            collect(children.item(index), text);
        }
        if ("p".equals(name)) {
            text.append('\n');
        }
    }

    private static Map<String, byte[]> readParts(byte[] bytes) throws IOException {
        Map<String, byte[]> parts = new HashMap<>();
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(bytes))) {
            ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (!entry.isDirectory() && isRelevantPart(entry.getName())) {
                    byte[] content = readEntry(zip);
                    if (content != null) {
                        parts.put(entry.getName(), content);
                    }
                }
                zip.closeEntry();
            }
        }
        return parts;
    }

    private static boolean isRelevantPart(String name) {
        return WORD_DOCUMENT.equals(name)
                || XLSX_SHARED_STRINGS.equals(name)
                || (name.startsWith(PPT_SLIDE_PREFIX) && name.endsWith(XML_SUFFIX))
                || (name.startsWith(XLSX_SHEET_PREFIX) && name.endsWith(XML_SUFFIX));
    }

    private static byte[] readEntry(InputStream input) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int total = 0;
        int read;
        while ((read = input.read(buffer)) != -1) {
            total += read;
            if (total > MAX_PART_BYTES) {
                return null;
            }
            output.write(buffer, 0, read);
        }
        return output.toByteArray();
    }

    private static List<String> matching(Map<String, byte[]> parts, String prefix, String suffix) {
        List<String> names = new ArrayList<>();
        for (String name : parts.keySet()) {
            if (name.startsWith(prefix) && name.endsWith(suffix)) {
                names.add(name);
            }
        }
        return names;
    }

    private static Document parse(byte[] xml) {
        if (xml == null || xml.length == 0) {
            return null;
        }
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            factory.setExpandEntityReferences(false);
            setFeature(factory, "http://apache.org/xml/features/disallow-doctype-decl", true);
            setFeature(factory, "http://xml.org/sax/features/external-general-entities", false);
            setFeature(factory, "http://xml.org/sax/features/external-parameter-entities", false);
            setFeature(factory, "http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
            DocumentBuilder builder = factory.newDocumentBuilder();
            return builder.parse(new ByteArrayInputStream(xml));
        } catch (Exception e) {
            return null;
        }
    }

    private static void setFeature(DocumentBuilderFactory factory, String feature, boolean value) {
        try {
            factory.setFeature(feature, value);
        } catch (Exception ignored) {
            // Unsupported feature on this parser: keep the remaining hardening.
        }
    }

    private static String localName(Node node) {
        String local = node.getLocalName();
        return local != null ? local : node.getNodeName();
    }

    private static String join(List<String> values, String separator) {
        StringBuilder builder = new StringBuilder();
        for (int index = 0; index < values.size(); index++) {
            if (index > 0) {
                builder.append(separator);
            }
            builder.append(values.get(index));
        }
        return builder.toString();
    }

    private static int compareByLengthThenName(String left, String right) {
        if (left.length() != right.length()) {
            return Integer.compare(left.length(), right.length());
        }
        return left.compareTo(right);
    }

    private static String normalize(String text) {
        if (text == null) {
            return "";
        }
        String unix = text.replace("\r\n", "\n").replace('\r', '\n');
        StringBuilder cleaned = new StringBuilder(unix.length());
        int newlineRun = 0;
        for (int index = 0; index < unix.length(); index++) {
            char current = unix.charAt(index);
            if (current == '\n') {
                while (cleaned.length() > 0) {
                    char last = cleaned.charAt(cleaned.length() - 1);
                    if (last == ' ' || last == '\t') {
                        cleaned.setLength(cleaned.length() - 1);
                    } else {
                        break;
                    }
                }
                newlineRun++;
                if (newlineRun <= 2) {
                    cleaned.append('\n');
                }
            } else {
                newlineRun = 0;
                cleaned.append(current);
            }
        }
        return cleaned.toString().trim();
    }
}
