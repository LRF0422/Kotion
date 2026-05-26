package com.knowledge.wiki.service.entity.event;

import org.springframework.context.ApplicationEvent;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class PagePublishEvent extends ApplicationEvent {

    private Long pageId;
    private Long versionId;

    public PagePublishEvent(Object source) {
        super(source);
    }

}
