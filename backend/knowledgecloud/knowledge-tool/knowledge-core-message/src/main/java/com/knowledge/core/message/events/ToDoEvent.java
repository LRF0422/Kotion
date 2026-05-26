package com.knowledge.core.message.events;

import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.List;

@EqualsAndHashCode(callSuper = true)
@Data
public class ToDoEvent extends SystemEvent {

	private List<Long> targetUsers;
}
