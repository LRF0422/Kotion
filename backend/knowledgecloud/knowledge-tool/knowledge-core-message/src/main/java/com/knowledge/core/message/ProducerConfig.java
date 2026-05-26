package com.knowledge.core.message;


import lombok.Data;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@ConfigurationProperties(prefix = "knowledge.rocketmq.producer")
@Configuration
@Data
public class ProducerConfig {

	private String namesrvAddr;
	private String groupName;

}
