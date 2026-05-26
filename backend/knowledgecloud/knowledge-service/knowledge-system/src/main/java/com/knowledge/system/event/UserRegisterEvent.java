package com.knowledge.system.event;

import lombok.Getter;
import lombok.Setter;
import org.springframework.context.ApplicationEvent;

import java.util.List;
import java.util.Map;

@Getter
@Setter
public class UserRegisterEvent extends ApplicationEvent {

    private Long userId;
    private Long roleId;
    private Map<Long, Long> joinAppInfo;


    public UserRegisterEvent(Object source) {
        super(source);
    }
}
