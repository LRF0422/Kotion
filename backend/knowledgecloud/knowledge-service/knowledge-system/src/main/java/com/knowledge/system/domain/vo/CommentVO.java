package com.knowledge.system.domain.vo;

import java.io.Serializable;

import com.knowledge.system.domain.enums.CommentStatus;

import lombok.Data;

@Data
public class CommentVO implements Serializable {
    private Long id;
    private String objectId;
    private String commentId;
    private String parentId;
    private String content;
    private Long userId;
    private String nickName;
    private String avatar;
    private CommentStatus status;
}
