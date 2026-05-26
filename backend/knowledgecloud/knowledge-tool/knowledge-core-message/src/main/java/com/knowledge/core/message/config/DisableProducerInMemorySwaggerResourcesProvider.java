package com.knowledge.core.message.config;

import java.util.function.Supplier;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.Message;

@Configuration
public class DisableProducerInMemorySwaggerResourcesProvider {

    @Bean
    public Supplier<Message<String>> defaultSupplierProducer() {
        return () -> {

            return null;
        };
    }

}
