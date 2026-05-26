package com.knowledge.core.message.events;

import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.List;

@EqualsAndHashCode(callSuper = true)
@Data
public class SystemMessageEvent extends SystemEvent {
	private List<Long> targetUserId;
}
