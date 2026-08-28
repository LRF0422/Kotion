package com.knowledge.gateway.filter;

import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;

import reactor.core.publisher.Mono;

/** Reject refresh JWTs when they are presented as resource Bearer tokens. */
@Component
public class AccessTokenTypeFilter implements GlobalFilter, Ordered {

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        return exchange.getPrincipal()
                .map(principal -> {
                    if (!(principal instanceof JwtAuthenticationToken)) {
                        return false;
                    }
                    Object tokenType = ((JwtAuthenticationToken) principal).getToken().getClaim("token_type");
                    return !"access_token".equals(String.valueOf(tokenType));
                })
                .defaultIfEmpty(false)
                .flatMap(invalidTokenType -> {
                    if (!invalidTokenType) {
                        return chain.filter(exchange);
                    }
                    exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
                    return exchange.getResponse().setComplete();
                });
    }

    @Override
    public int getOrder() {
        return -900;
    }
}
