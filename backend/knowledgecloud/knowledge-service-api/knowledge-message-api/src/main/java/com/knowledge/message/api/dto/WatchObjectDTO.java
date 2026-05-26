package com.knowledge.message.api.dto;

import lombok.Data;

import java.io.Serializable;

@Data
public class WatchObjectDTO implements Serializable {
    private Long objectId;
    private String objectName;
    private String category;
    private String objectUrl;
}
