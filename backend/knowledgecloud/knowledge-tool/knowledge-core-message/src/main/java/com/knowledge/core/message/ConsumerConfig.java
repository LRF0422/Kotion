package com.knowledge.core.message;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@ConfigurationProperties(prefix = "knowledge.rocketmq.consumer")
@Configuration
@Data
public class ConsumerConfig {
	private String namesrvAddr;
	private String groupName;
}
