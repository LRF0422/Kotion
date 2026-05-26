package com.knowledge.wiki.service.entity.event;

import org.springframework.context.ApplicationEvent;

import lombok.Data;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class InvitationAcceptEvent extends ApplicationEvent {

    public InvitationAcceptEvent(Object source) {
        super(source);
    }

    private Long id;

}
