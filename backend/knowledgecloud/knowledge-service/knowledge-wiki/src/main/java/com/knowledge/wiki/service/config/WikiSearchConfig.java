package com.knowledge.wiki.service.config;

import java.time.Duration;

import org.apache.commons.pool2.impl.GenericObjectPoolConfig;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import cn.hutool.core.util.StrUtil;
import lombok.extern.slf4j.Slf4j;
import redis.clients.jedis.DefaultJedisClientConfig;
import redis.clients.jedis.HostAndPort;
import redis.clients.jedis.JedisClientConfig;
import redis.clients.jedis.JedisPooled;
import redis.clients.jedis.UnifiedJedis;
import redis.clients.jedis.Connection;

/**
 * Configuration for the Jedis client used by RediSearch.
 * <p>
 * Reads the same {@code spring.redis.*} properties used by Spring Data Redis
 * (Lettuce) and creates an independent {@link UnifiedJedis} bean for
 * RediSearch operations. The two clients coexist without conflict.
 * </p>
 */
@Configuration
@Slf4j
public class WikiSearchConfig {

    @Value("${spring.redis.host:127.0.0.1}")
    private String redisHost;

    @Value("${spring.redis.port:6379}")
    private int redisPort;

    @Value("${spring.redis.password:}")
    private String redisPassword;

    @Value("${spring.redis.database:0}")
    private int redisDatabase;

    @Value("${spring.redis.timeout:2000}")
    private int redisTimeout;

    /**
     * Create a pooled Jedis client for RediSearch commands.
     * <p>
     * JedisPooled lazily connects — bean creation succeeds even if Redis is
     * temporarily down. Actual connection errors surface when search methods
     * are invoked and are caught by {@code WikiSearchService}.
     * </p>
     */
    @Bean
    public UnifiedJedis unifiedJedis() {
        log.info("Initializing Jedis for RediSearch: {}:{}, db={}", redisHost, redisPort, redisDatabase);

        GenericObjectPoolConfig<Connection> poolConfig = new GenericObjectPoolConfig<>();
        poolConfig.setMaxTotal(16);
        poolConfig.setMaxIdle(8);
        poolConfig.setMinIdle(2);
        poolConfig.setMaxWait(Duration.ofMillis(redisTimeout));
        poolConfig.setTestWhileIdle(true);
        poolConfig.setTimeBetweenEvictionRuns(Duration.ofSeconds(30));

        HostAndPort hostAndPort = new HostAndPort(redisHost, redisPort);
        DefaultJedisClientConfig.Builder configBuilder = DefaultJedisClientConfig.builder()
                .connectionTimeoutMillis(redisTimeout)
                .database(redisDatabase);
        if (StrUtil.isNotBlank(redisPassword)) {
            configBuilder.password(redisPassword);
        }
        JedisClientConfig clientConfig = configBuilder.build();

        JedisPooled jedis = new JedisPooled(poolConfig, hostAndPort, clientConfig);

        log.info("Jedis RediSearch client initialized");
        return jedis;
    }
}
