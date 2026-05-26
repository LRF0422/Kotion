package com.knowledge.core.message.core;

import com.knowledge.core.message.events.SystemEvent;
import org.springframework.core.Ordered;

public interface EventInterceptor extends Ordered {

	void onEvent(RemoteEvent systemEvent);
}
