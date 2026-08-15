package com.knowledge.gateway.filter;

import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * SSE streaming filter — ensures SSE responses are not buffered by the gateway
 * and are forwarded to the client in real-time.
 *
 * <p>
 * For requests that produce {@code text/event-stream}, this filter:
 * <ul>
 * <li>Sets {@code X-Accel-Buffering: no} (for nginx reverse proxy)</li>
 * <li>Sets {@code Cache-Control: no-cache} to prevent proxy caching</li>
 * <li>Sets {@code Connection: keep-alive} to maintain the stream</li>
 * </ul>
 */
@Component
public class SseStreamingFilter implements GlobalFilter, Ordered {

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpResponse response = exchange.getResponse();
        HttpHeaders headers = response.getHeaders();

        // Always set X-Accel-Buffering for all responses going through the gateway.
        // This tells nginx (if present) to not buffer the response.
        headers.set("X-Accel-Buffering", "no");

        // Check if the request path looks like an SSE endpoint
        String path = exchange.getRequest().getPath().value();
        if (isSsePath(path)) {
            // Set headers that help SSE streaming through proxies
            headers.set("Cache-Control", "no-cache");
            headers.set("Connection", "keep-alive");
        }

        return chain.filter(exchange);
    }

    /**
     * Checks if the request path is likely to produce an SSE response.
     * Includes the agent task/chat streaming endpoints — these previously fell
     * through and relied on the global X-Accel-Buffering header alone.
     */
    private boolean isSsePath(String path) {
        return path != null && (path.contains("/chat/completions")
                || path.contains("/completions")
                || path.contains("/api/v2/agent")
                || path.startsWith("/ws/"));
    }

    @Override
    public int getOrder() {
        // Run early so headers are set before the response is committed
        return Ordered.HIGHEST_PRECEDENCE + 1000;
    }
}
