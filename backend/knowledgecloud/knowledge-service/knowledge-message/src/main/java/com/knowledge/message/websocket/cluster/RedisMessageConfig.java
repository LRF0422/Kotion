package com.knowledge.message.websocket.cluster;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.data.redis.listener.adapter.MessageListenerAdapter;

/**
 * Redis Pub/Sub Configuration for WebSocket Cluster Support
 * Enables message broadcasting across multiple service instances
 */
@Slf4j
@Configuration
@RequiredArgsConstructor
public class RedisMessageConfig {

    private final RedisConnectionFactory redisConnectionFactory;
    private final RedisMessageSubscriber redisMessageSubscriber;

    /**
     * Redis channel topic for WebSocket messages
     */
    @Bean
    public ChannelTopic webSocketChannelTopic() {
        return new ChannelTopic(RedisMessagePublisher.WEBSOCKET_CHANNEL);
    }

    /**
     * Message listener adapter
     */
    @Bean
    public MessageListenerAdapter webSocketMessageListenerAdapter() {
        return new MessageListenerAdapter(redisMessageSubscriber);
    }

    /**
     * Redis message listener container
     * Handles subscription to Redis channels
     */
    @Bean
    public RedisMessageListenerContainer redisMessageListenerContainer() {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(redisConnectionFactory);
        container.addMessageListener(redisMessageSubscriber, webSocketChannelTopic());
        log.info("Redis message listener container configured for WebSocket cluster support");
        return container;
    }
}
