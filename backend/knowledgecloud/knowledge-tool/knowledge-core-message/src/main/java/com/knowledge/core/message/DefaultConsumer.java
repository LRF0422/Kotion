package com.knowledge.core.message;

import com.alibaba.fastjson.JSON;
import com.knowledge.core.message.core.EventListener;
import com.knowledge.core.message.core.RemoteEvent;
import com.knowledge.core.message.core.constant.MessageConstant;
import com.knowledge.core.tool.constant.KnowledgeConstant;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.lang3.StringUtils;
import org.apache.rocketmq.client.consumer.DefaultMQPushConsumer;
import org.apache.rocketmq.client.consumer.listener.ConsumeConcurrentlyStatus;
import org.apache.rocketmq.client.consumer.listener.MessageListenerConcurrently;
import org.apache.rocketmq.common.message.MessageExt;

import java.nio.charset.StandardCharsets;
import java.util.Optional;

@Slf4j
public abstract class DefaultConsumer {

	@SneakyThrows
	public void subscribe(EventListener listenerEvent, ProducerConfig producerConfig) {
		DefaultMQPushConsumer consumer = new DefaultMQPushConsumer(MessageConstant.DEFAULT_PRODUCER_GROUP);
		// topic & tag 不填的话默认使用event的simpleName
		String tag = StringUtils.isNotEmpty(listenerEvent.tag()) ? listenerEvent.tag() : listenerEvent.value().getSimpleName();
		String topic = StringUtils.isNotEmpty(listenerEvent.topic()) ? listenerEvent.topic() : MessageConstant.DEFAULT_TOPIC;
		String group = StringUtils.isNotEmpty(listenerEvent.group()) ? listenerEvent.group() : Optional.ofNullable(producerConfig.getGroupName()).orElse(listenerEvent.value().getSimpleName());
		consumer.setNamesrvAddr(producerConfig.getNamesrvAddr());
		consumer.subscribe(topic, tag);
		consumer.setInstanceName(tag);
		consumer.setConsumerGroup(group);
		consumer.setMaxReconsumeTimes(3);
		consumer.setMessageModel(listenerEvent.mode());
		consumer.registerMessageListener((MessageListenerConcurrently) (list, consumeConcurrentlyContext) -> {
			log.info("receive message from mq, message body => {}", JSON.toJSONString(list));
			if (list != null && list.size() > 0) {
				try {
					MessageExt messageExt = list.get(0);
					String body = new String(messageExt.getBody(), StandardCharsets.UTF_8);
					RemoteEvent event = JSON.parseObject(body, listenerEvent.value());
					return DefaultConsumer.this.handle(event);
				} catch (Exception e) {
					e.printStackTrace();
					return ConsumeConcurrentlyStatus.RECONSUME_LATER;
				}
			}
			return ConsumeConcurrentlyStatus.CONSUME_SUCCESS;
		});
		log.info("register listener with topic: {}, tags: {}, group: {}", topic, tag, group);
		consumer.start();
	}

	public abstract ConsumeConcurrentlyStatus handle(RemoteEvent event);
}
