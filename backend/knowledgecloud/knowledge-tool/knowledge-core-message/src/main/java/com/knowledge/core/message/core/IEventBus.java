package com.knowledge.core.message.core;

import org.springframework.context.ApplicationEvent;

public interface IEventBus {

	void dispatch(RemoteEvent event);

	void dispatch(ApplicationEvent event);
}
