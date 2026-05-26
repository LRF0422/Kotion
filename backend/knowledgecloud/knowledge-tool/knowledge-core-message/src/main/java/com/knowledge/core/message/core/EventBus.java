package com.knowledge.core.message.core;

import com.alibaba.fastjson.JSON;
import com.knowledge.core.message.core.constant.MessageConstant;
import lombok.SneakyThrows;
import org.apache.commons.lang3.StringUtils;
import org.apache.rocketmq.client.producer.DefaultMQProducer;
import org.apache.rocketmq.common.message.Message;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ApplicationEvent;

import java.util.Optional;

public class EventBus implements IEventBus {

	// @Autowired
	// private DefaultMQProducer producer;
	@Autowired
	private ApplicationContext applicationContext;

	@Override
	@SneakyThrows
	public void dispatch(RemoteEvent event) {
		Message message = new Message();
		message.setTags(Optional.ofNullable(event.getTag()).orElse(event.getClass().getSimpleName()));
		message.setTopic(Optional.ofNullable(event.getTopic()).orElse(MessageConstant.DEFAULT_TOPIC));
		message.setBody(JSON.toJSONString(event).getBytes());
		// producer.send(message);
	}

	@Override
	public void dispatch(ApplicationEvent event) {
		applicationContext.publishEvent(event);
	}
}
