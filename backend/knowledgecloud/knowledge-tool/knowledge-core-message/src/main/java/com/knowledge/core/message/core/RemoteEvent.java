package com.knowledge.core.message.core;

import lombok.Data;

import java.io.Serializable;

@Data
public abstract class RemoteEvent implements Serializable {

	/**
	 * 事件来源，一般为applicationName
	 */
	private String source;
	private String title;
	private String content;
	private String operationUrl;
	private Long authorId;
	private String author;
	private String authorIcon;
	private String tenantId;
	private String tag;
	private String topic;

}
