package com.knowledge.core.message.events;

import com.knowledge.core.message.core.RemoteEvent;
import lombok.Data;
import lombok.EqualsAndHashCode;

@EqualsAndHashCode(callSuper = true)
@Data
public class P2PEvent extends RemoteEvent {
	private Long receiver;
}
