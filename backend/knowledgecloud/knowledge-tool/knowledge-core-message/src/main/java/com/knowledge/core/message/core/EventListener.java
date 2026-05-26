package com.knowledge.core.message.core;

import org.apache.rocketmq.common.protocol.heartbeat.MessageModel;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Target({ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
public @interface EventListener {
	Class<? extends RemoteEvent> value();
	String tag() default "";
	String topic() default "";
	String group() default "";
	MessageModel mode() default MessageModel.CLUSTERING;
}
