package com.knowledge.filecenter.service;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.Collections;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.knowledge.filecenter.skill.WebDownloadProperties;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

class RemoteFileDownloadServiceTest {

    private WebDownloadProperties properties;
    private RemoteFileDownloadService service;
    private HttpServer server;

    @BeforeEach
    void setUp() {
        properties = new WebDownloadProperties();
        properties.setHeadCheckEnabled(false);
        properties.setRetryCount(0);
        service = new RemoteFileDownloadService(properties);
    }

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop(0);
            server = null;
        }
    }

    // ------------------------------------------------------------------
    // SSRF / URL validation
    // ------------------------------------------------------------------

    @Test
    void rejectsUnsupportedSchemes() {
        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> service.assertSafeUrl("ftp://example.com/file.txt"));
        assertTrue(error.getMessage().contains("scheme"), error.getMessage());
        assertThrows(IllegalArgumentException.class, () -> service.assertSafeUrl("file:///etc/passwd"));
    }

    @Test
    void rejectsPrivateAndLoopbackTargets() {
        for (String url : Arrays.asList(
                "http://127.0.0.1/file",
                "http://localhost/file",
                "http://10.1.2.3/file",
                "http://172.16.0.1/file",
                "http://192.168.0.10/file",
                "http://169.254.169.254/latest/meta-data/",
                "http://100.64.0.1/file",
                "http://0.0.0.0/file",
                "http://[::1]/file",
                "http://[fc00::1]/file")) {
            assertThrows(IllegalArgumentException.class, () -> service.assertSafeUrl(url), url);
        }
    }

    @Test
    void allowsPublicIpLiteral() {
        assertDoesNotThrow(() -> service.assertSafeUrl("http://8.8.8.8/file.txt"));
    }

    @Test
    void allowedHostsBypassPrivateBlock() {
        properties.setAllowedHosts(Collections.singletonList("127.0.0.1"));
        assertDoesNotThrow(() -> service.assertSafeUrl("http://127.0.0.1/file"));

        properties.setAllowedHosts(Collections.singletonList(".internal.example"));
        assertDoesNotThrow(() -> service.assertSafeUrl("http://host.internal.example/file"));
        // Not covered by the allowlist -> private literal is still rejected (no DNS lookup needed).
        assertThrows(IllegalArgumentException.class, () -> service.assertSafeUrl("http://10.0.0.1/file"));
    }

    @Test
    void blockPrivateAddressesCanBeDisabled() {
        properties.setBlockPrivateAddresses(false);
        assertDoesNotThrow(() -> service.assertSafeUrl("http://10.0.0.1/file"));
    }

    @Test
    void flagsPrivateAddressRanges() throws Exception {
        assertTrue(RemoteFileDownloadService.isPrivateAddress(InetAddress.getByName("127.0.0.1")));
        assertTrue(RemoteFileDownloadService.isPrivateAddress(InetAddress.getByName("10.0.0.1")));
        assertTrue(RemoteFileDownloadService.isPrivateAddress(InetAddress.getByName("172.20.0.1")));
        assertTrue(RemoteFileDownloadService.isPrivateAddress(InetAddress.getByName("192.168.1.1")));
        assertTrue(RemoteFileDownloadService.isPrivateAddress(InetAddress.getByName("169.254.1.1")));
        assertTrue(RemoteFileDownloadService.isPrivateAddress(InetAddress.getByName("100.100.0.1")));
        assertTrue(RemoteFileDownloadService.isPrivateAddress(InetAddress.getByName("224.0.0.1")));
        assertTrue(RemoteFileDownloadService.isPrivateAddress(InetAddress.getByName("::1")));
        assertTrue(RemoteFileDownloadService.isPrivateAddress(InetAddress.getByName("fc00::1")));
        assertFalse(RemoteFileDownloadService.isPrivateAddress(InetAddress.getByName("8.8.8.8")));
        assertFalse(RemoteFileDownloadService.isPrivateAddress(InetAddress.getByName("172.32.0.1")));
        assertFalse(RemoteFileDownloadService.isPrivateAddress(InetAddress.getByName("2606:4700::1111")));
    }

    @Test
    void rejectsBlankAndMalformedUrls() {
        assertThrows(IllegalArgumentException.class, () -> service.download("   ", null, false));
        assertThrows(IllegalArgumentException.class, () -> service.download("not a url", null, false));
        assertThrows(IllegalArgumentException.class, () -> service.download(null, null, false));
    }

    // ------------------------------------------------------------------
    // Pure helpers
    // ------------------------------------------------------------------

    @Test
    void parsesContentDisposition() {
        assertEquals("report.pdf",
                RemoteFileDownloadService.parseContentDisposition("attachment; filename=\"report.pdf\""));
        assertEquals("report.pdf",
                RemoteFileDownloadService.parseContentDisposition("attachment; filename=report.pdf"));
        assertEquals("\u62a5\u544a.pdf",
                RemoteFileDownloadService.parseContentDisposition("attachment; filename*=UTF-8''%E6%8A%A5%E5%91%8A.pdf"));
        // RFC 5987 form wins over the plain form
        assertEquals("star.pdf", RemoteFileDownloadService.parseContentDisposition(
                "attachment; filename=\"plain.pdf\"; filename*=UTF-8''star.pdf"));
        assertNull(RemoteFileDownloadService.parseContentDisposition(null));
        assertNull(RemoteFileDownloadService.parseContentDisposition("attachment"));
    }

    @Test
    void derivesFileNameFromUrl() {
        assertEquals("report.pdf",
                RemoteFileDownloadService.deriveFileNameFromUrl("https://example.com/a/b/report.pdf?token=1"));
        assertEquals("a b.txt",
                RemoteFileDownloadService.deriveFileNameFromUrl("https://example.com/a%20b.txt"));
        assertEquals("downloaded_file", RemoteFileDownloadService.deriveFileNameFromUrl("https://example.com/"));
    }

    @Test
    void mapsContentTypeExtensions() {
        assertEquals("pdf", RemoteFileDownloadService.extensionForContentType("application/pdf"));
        assertEquals("jpg", RemoteFileDownloadService.extensionForContentType("image/jpeg; charset=binary"));
        assertEquals("txt", RemoteFileDownloadService.extensionForContentType("text/plain; charset=utf-8"));
        assertNull(RemoteFileDownloadService.extensionForContentType(null));
        assertNull(RemoteFileDownloadService.extensionForContentType("application/x-unknown"));
        assertEquals("text/plain", RemoteFileDownloadService.normalizeContentType("Text/Plain; charset=utf-8"));
    }

    @Test
    void sanitizesFileNames() {
        assertEquals("passwd", service.sanitizeFileName("../../etc/passwd"));
        assertEquals("a_b_c_.txt", service.sanitizeFileName("a:b*c?.txt"));
        assertEquals("downloaded_file", service.sanitizeFileName("   "));
        assertEquals("downloaded_file", service.sanitizeFileName(".."));

        properties.setMaxFileNameLength(10);
        assertEquals("abcdef.pdf", service.sanitizeFileName("abcdefghijklmnop.pdf"));
    }

    // ------------------------------------------------------------------
    // End-to-end against a local HTTP server
    // ------------------------------------------------------------------

    @Test
    void downloadsFileAndUsesContentDispositionName() throws Exception {
        properties.setAllowedHosts(Collections.singletonList("127.0.0.1"));
        String base = startServer(exchange -> {
            byte[] body = "hello world".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "text/plain; charset=utf-8");
            exchange.getResponseHeaders().set("Content-Disposition",
                    "attachment; filename*=UTF-8''%E6%8A%A5%E5%91%8A.txt");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });

        try (RemoteFileDownloadService.DownloadedFile downloaded = service.download(base + "/file", null, false)) {
            assertEquals("\u62a5\u544a.txt", downloaded.getFileName());
            assertEquals(11L, downloaded.getSize());
            assertEquals("text/plain", downloaded.getContentType());
            assertEquals("hello world",
                    new String(Files.readAllBytes(downloaded.getFile().toPath()), StandardCharsets.UTF_8));
        }
    }

    @Test
    void followsRedirectToAllowedHost() throws Exception {
        properties.setAllowedHosts(Collections.singletonList("127.0.0.1"));
        String base = startServer(exchange -> {
            if ("/redirect".equals(exchange.getRequestURI().getPath())) {
                exchange.getResponseHeaders().set("Location", "/file");
                exchange.sendResponseHeaders(302, -1);
                exchange.close();
                return;
            }
            byte[] body = "redirected".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "text/plain");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });

        try (RemoteFileDownloadService.DownloadedFile downloaded = service.download(base + "/redirect", null, false)) {
            assertEquals("redirected",
                    new String(Files.readAllBytes(downloaded.getFile().toPath()), StandardCharsets.UTF_8));
        }
    }

    @Test
    void blocksRedirectToPrivateAddress() throws Exception {
        properties.setAllowedHosts(Collections.singletonList("127.0.0.1"));
        String base = startServer(exchange -> {
            exchange.getResponseHeaders().set("Location", "http://169.254.169.254/latest/meta-data/");
            exchange.sendResponseHeaders(302, -1);
            exchange.close();
        });

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                () -> service.download(base + "/evil", null, false));
        assertTrue(error.getMessage().contains("private") || error.getMessage().contains("Blocked"),
                error.getMessage());
    }

    @Test
    void rejectsOversizeContentLengthBeforeStreaming() throws Exception {
        properties.setAllowedHosts(Collections.singletonList("127.0.0.1"));
        properties.setMaxDownloadSize(5);
        AtomicInteger bodyReads = new AtomicInteger();
        String base = startServer(exchange -> {
            byte[] body = new byte[100];
            exchange.getResponseHeaders().set("Content-Type", "application/octet-stream");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            bodyReads.incrementAndGet();
            exchange.close();
        });

        assertThrows(RemoteFileDownloadService.NonRetryableDownloadException.class,
                () -> service.download(base + "/huge", null, false));
    }

    @Test
    void enforcesSizeLimitWhileStreamingWhenLengthUnknown() throws Exception {
        properties.setAllowedHosts(Collections.singletonList("127.0.0.1"));
        properties.setMaxDownloadSize(5);
        String base = startServer(exchange -> {
            byte[] body = "0123456789A".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/octet-stream");
            // length 0 => chunked response without Content-Length
            exchange.sendResponseHeaders(200, 0);
            exchange.getResponseBody().write(body);
            exchange.close();
        });

        assertThrows(RemoteFileDownloadService.NonRetryableDownloadException.class,
                () -> service.download(base + "/big", null, false));
    }

    @Test
    void retriesTransientServerErrors() throws Exception {
        properties.setAllowedHosts(Collections.singletonList("127.0.0.1"));
        properties.setRetryCount(1);
        AtomicInteger calls = new AtomicInteger();
        String base = startServer(exchange -> {
            if (calls.incrementAndGet() == 1) {
                exchange.sendResponseHeaders(503, -1);
                exchange.close();
                return;
            }
            byte[] body = "ok".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });

        try (RemoteFileDownloadService.DownloadedFile downloaded = service.download(base + "/retry", null, false)) {
            assertEquals("ok", new String(Files.readAllBytes(downloaded.getFile().toPath()), StandardCharsets.UTF_8));
        }
        assertEquals(2, calls.get());
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private String startServer(HttpHandler handler) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", handler);
        server.start();
        assertNotNull(server.getAddress());
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }
}
