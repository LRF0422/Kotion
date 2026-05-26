package com.knowledge.core.message.events;

import com.knowledge.core.message.core.RemoteEvent;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public abstract class SystemEvent extends RemoteEvent {
	private String tenantId;
}
