package com.knowledge.core.message.core;

import com.knowledge.core.message.ConsumerConfig;
import com.knowledge.core.message.DefaultConsumer;
import com.knowledge.core.message.ProducerConfig;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import org.apache.rocketmq.client.consumer.listener.ConsumeConcurrentlyStatus;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.core.Ordered;
import org.springframework.stereotype.Component;

import javax.annotation.PostConstruct;
import java.lang.reflect.Method;
import java.util.*;
import java.util.stream.Collectors;

/**
 * todo add RemoteEventListener support
 */
@Component
@Slf4j
public class ListenerRegister {

	@Autowired
	private ApplicationContext applicationContext;
	@Autowired
	private ProducerConfig producerConfig;
	private Collection<EventInterceptor> eventInterceptors;


	@PostConstruct
	private void init() {
		String[] beanName = applicationContext.getBeanDefinitionNames();
		eventInterceptors = getEventInterceptors();
		for (String bean : beanName) {
			Class<?> object = applicationContext.getType(bean);
			if (object != null) {
				Method[] methods = object.getDeclaredMethods();
				for (Method method : methods) {
					if (method.isAnnotationPresent(EventListener.class)) {
						EventListener eventListener = method.getAnnotation(EventListener.class);
						Class<? extends RemoteEvent> e = eventListener.value();
						DefaultConsumer consumer = new DefaultConsumer() {
							@Override
							@SneakyThrows
							public ConsumeConcurrentlyStatus handle(RemoteEvent event) {
								try {
									eventInterceptors.forEach(it -> {
										it.onEvent(event);
									});
									method.invoke(applicationContext.getBean(bean), event);
									return ConsumeConcurrentlyStatus.CONSUME_SUCCESS ;
								} catch (Exception exception) {
									exception.printStackTrace();
									return ConsumeConcurrentlyStatus.RECONSUME_LATER;
								}
							}
						};
						consumer.subscribe(eventListener, producerConfig);
					}
				}
			}
		}
	}

	private Collection<EventInterceptor> getEventInterceptors() {
		Map<String, EventInterceptor> interceptorMap = applicationContext.getBeansOfType(EventInterceptor.class);
		if (interceptorMap.size() > 0) {
			return interceptorMap.values().stream().sorted(Comparator.comparing(Ordered::getOrder)).collect(Collectors.toList());
		}
		return new ArrayList<>();
	}


}
