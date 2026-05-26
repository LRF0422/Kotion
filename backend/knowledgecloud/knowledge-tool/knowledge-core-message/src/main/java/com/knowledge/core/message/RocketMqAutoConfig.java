package com.knowledge.core.message;

import com.knowledge.core.message.core.EventBus;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

@AutoConfiguration
@Configuration
@Slf4j
@Import({ ProducerConfig.class, ConsumerConfig.class, EventBus.class })
public class RocketMqAutoConfig {

	@Autowired
	private ProducerConfig producerConfig;

	// @Bean
	// public DefaultMQProducer defaultMQProducer() throws MQClientException {
	// log.info("init default with config => {}", producerConfig.toString());
	// DefaultMQProducer defaultMQProducer = new
	// DefaultMQProducer(MessageConstant.DEFAULT_PRODUCER_GROUP);
	// defaultMQProducer.setNamesrvAddr(producerConfig.getNamesrvAddr());
	// defaultMQProducer.setVipChannelEnabled(false);
	// defaultMQProducer.setRetryTimesWhenSendAsyncFailed(10);
	// defaultMQProducer.start();
	// return defaultMQProducer;
	// }

	// @Bean
	// public Jackson2ObjectMapperBuilderCustomizer
	// jackson2ObjectMapperBuilderCustomizer() {
	// return builder -> {
	// builder.deserializerByType(Watchable.class, new WatchableDeserializer());
	// };
	// }

}
