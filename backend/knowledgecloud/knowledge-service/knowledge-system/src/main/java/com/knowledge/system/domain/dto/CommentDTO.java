package com.knowledge.system.domain.dto;

import java.io.Serializable;

import lombok.Data;

@Data
public class CommentDTO implements Serializable {
    private Long id;
    private String objectId;
    private String commentId;
    private String parentId;
    private String content;
    private Long userId;
    private String nickName;
    private String avatar;
}
