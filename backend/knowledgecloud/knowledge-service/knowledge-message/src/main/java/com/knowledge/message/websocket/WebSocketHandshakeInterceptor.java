package com.knowledge.message.websocket;

import com.knowledge.core.secure.provider.JwtTokenProvider;
import com.knowledge.core.tool.KnowledgeUser;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import javax.servlet.http.HttpServletRequest;
import java.util.Map;

/**
 * WebSocket Handshake Interceptor for authentication
 */
@Slf4j
@Component
public class WebSocketHandshakeInterceptor implements HandshakeInterceptor {

    public static final String USER_ID_KEY = "userId";
    public static final String TENANT_ID_KEY = "tenantId";
    public static final String USER_NAME_KEY = "userName";

    @Autowired
    private JwtTokenProvider jwtTokenProvider;

    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response,
            WebSocketHandler wsHandler, Map<String, Object> attributes) {
        if (request instanceof ServletServerHttpRequest) {
            HttpServletRequest servletRequest = ((ServletServerHttpRequest) request).getServletRequest();

            // Try to get token from query parameter
            String token = servletRequest.getParameter("token");
            if (token != null && !token.isEmpty()) {
                KnowledgeUser user = jwtTokenProvider.extractUser(token);
                if (user != null && user.getUserId() != null) {
                    attributes.put(USER_ID_KEY, String.valueOf(user.getUserId()));
                    attributes.put(TENANT_ID_KEY, user.getTenantId());
                    attributes.put(USER_NAME_KEY, user.getUserName());
                    log.info("WebSocket handshake success for user: {}, userId: {}", user.getUserName(),
                            user.getUserId());
                    return true;
                }
            }

            log.warn("WebSocket handshake failed: invalid or missing token");
            return false;
        }
        return false;
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response,
            WebSocketHandler wsHandler, Exception exception) {
        if (exception != null) {
            log.error("WebSocket handshake error", exception);
        }
    }
}
