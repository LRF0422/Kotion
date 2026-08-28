package com.knowledge.auth.feign;

import org.springframework.context.annotation.Bean;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.cloud.openfeign.clientconfig.FeignClientConfigurer;

import com.knowledge.core.cloud.auth.ServiceTokenProvider;

import feign.RequestInterceptor;
import feign.RequestTemplate;

public class AuthInternalFeignConfiguration {

    @Bean
    public FeignClientConfigurer authInternalFeignClientConfigurer() {
        return new FeignClientConfigurer() {
            @Override
            public boolean inheritParentConfiguration() {
                return false;
            }
        };
    }

    @Bean
    public RequestInterceptor authInternalRequestInterceptor(ServiceTokenProvider serviceTokenProvider) {
        return new ServiceTokenRequestInterceptor(serviceTokenProvider);
    }

    private static final class ServiceTokenRequestInterceptor implements RequestInterceptor, Ordered {

        private final ServiceTokenProvider serviceTokenProvider;

        private ServiceTokenRequestInterceptor(ServiceTokenProvider serviceTokenProvider) {
            this.serviceTokenProvider = serviceTokenProvider;
        }

        @Override
        public void apply(RequestTemplate template) {
            template.removeHeader(HttpHeaders.AUTHORIZATION);
            template.header(HttpHeaders.AUTHORIZATION, "Bearer " + serviceTokenProvider.getServiceToken());
        }

        @Override
        public int getOrder() {
            return Ordered.LOWEST_PRECEDENCE;
        }
    }
}
