package com.knowledge.message.api.vo;

import lombok.Data;

import java.io.Serializable;

@Data
public class MailServerConfigVO implements Serializable {

    private Long id;
    private String host;
    private Integer port;
    private String username;
    private String password;
}
