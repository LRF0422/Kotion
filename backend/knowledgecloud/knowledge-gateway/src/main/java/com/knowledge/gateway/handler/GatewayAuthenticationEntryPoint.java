/**
 * Copyright (c) 2018-2028, Chill Zhuang 庄骞 (smallchill@163.com).
 * <p>
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * <p>
 * http://www.apache.org/licenses/LICENSE-2.0
 * <p>
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package com.knowledge.gateway.handler;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.gateway.provider.ResponseProvider;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.security.web.server.ServerAuthenticationEntryPoint;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;

/**
 * Custom authentication entry point for the gateway.
 * Returns 401 JSON responses in the same format as the legacy ResponseProvider.
 *
 * @author Knowledge
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class GatewayAuthenticationEntryPoint implements ServerAuthenticationEntryPoint {

    private final ObjectMapper objectMapper;

    @Override
    public Mono<Void> commence(ServerWebExchange exchange, AuthenticationException ex) {
        ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(HttpStatus.UNAUTHORIZED);
        response.getHeaders().setContentType(MediaType.APPLICATION_JSON);

        String message = determineErrorMessage(ex);
        log.debug("Authentication failed: {}", message);

        String result;
        try {
            result = objectMapper.writeValueAsString(ResponseProvider.unAuth(message));
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize authentication error response", e);
            result = "{\"code\":401,\"msg\":\"Authentication failed\",\"data\":null}";
        }

        DataBuffer buffer = response.bufferFactory().wrap(result.getBytes(StandardCharsets.UTF_8));
        return response.writeWith(Mono.just(buffer));
    }

    /**
     * Determines an appropriate error message based on the authentication
     * exception.
     *
     * @param ex the authentication exception
     * @return a user-friendly error message
     */
    private String determineErrorMessage(AuthenticationException ex) {
        if (ex instanceof InvalidBearerTokenException) {
            String message = ex.getMessage();
            if (message != null && message.contains("expired")) {
                return "令牌已过期";
            }
            return "请求未授权";
        }

        if (ex.getMessage() != null && ex.getMessage().contains("token")) {
            return "缺失令牌,鉴权失败";
        }

        return "请求未授权";
    }
}
