package com.knowledge.filecenter.thumbnail;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.Map;

import javax.imageio.ImageIO;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.springframework.stereotype.Service;

/**
 * Renders the first page of a PDF into a small JPEG thumbnail and keeps a
 * bounded in-memory LRU cache, so repeatedly listing the same folder neither
 * downloads the source PDF again nor re-renders it.
 */
@Service
public class PdfThumbnailService {

    /** Thumbnail width in pixels; grid cards render at ~160px CSS so 2x is plenty. */
    private static final int TARGET_WIDTH = 480;
    private static final int MAX_CACHE_ENTRIES = 256;

    private final Map<String, byte[]> cache = new LinkedHashMap<String, byte[]>(16, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, byte[]> eldest) {
            return size() > MAX_CACHE_ENTRIES;
        }
    };

    /**
     * Return a cached thumbnail when present, otherwise render it from the
     * supplied source. The cache key must change whenever the source changes.
     */
    public byte[] getOrRender(String cacheKey, ThumbnailSource source) throws IOException {
        synchronized (cache) {
            byte[] cached = cache.get(cacheKey);
            if (cached != null) {
                return cached;
            }
        }

        byte[] rendered;
        try (InputStream input = source.open()) {
            rendered = renderFirstPage(input);
        }

        synchronized (cache) {
            cache.put(cacheKey, rendered);
        }
        return rendered;
    }

    /** Render page 1 of a PDF as a JPEG scaled to {@link #TARGET_WIDTH}. */
    public byte[] renderFirstPage(InputStream input) throws IOException {
        try (PDDocument document = PDDocument.load(input)) {
            if (document.getNumberOfPages() == 0) {
                throw new IOException("PDF has no pages");
            }

            PDPage page = document.getPage(0);
            float pageWidth = page.getMediaBox() != null ? page.getMediaBox().getWidth() : 0f;
            if (pageWidth <= 0f) {
                throw new IOException("PDF page has no width");
            }

            // Clamp so an unusual page size cannot allocate a huge bitmap.
            float scale = Math.max(0.05f, Math.min(TARGET_WIDTH / pageWidth, 4f));
            BufferedImage image = new PDFRenderer(document).renderImage(0, scale, ImageType.RGB);

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            if (!ImageIO.write(image, "jpg", out)) {
                throw new IOException("No JPEG writer available");
            }
            return out.toByteArray();
        }
    }

    /** Opens the PDF bytes; implemented by the caller that owns storage access. */
    @FunctionalInterface
    public interface ThumbnailSource {
        InputStream open() throws IOException;
    }
}
