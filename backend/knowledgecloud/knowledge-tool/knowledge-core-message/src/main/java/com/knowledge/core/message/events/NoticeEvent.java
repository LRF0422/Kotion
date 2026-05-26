package com.knowledge.core.message.events;

import com.knowledge.core.message.core.RemoteEvent;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.List;

@EqualsAndHashCode(callSuper = true)
@Data
public class NoticeEvent extends RemoteEvent {
	private List<Long> targetUsers;
	private String poster;
}
