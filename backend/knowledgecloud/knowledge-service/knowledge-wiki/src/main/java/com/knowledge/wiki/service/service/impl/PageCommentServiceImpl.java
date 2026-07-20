package com.knowledge.wiki.service.service.impl;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.github.yulichang.base.MPJBaseServiceImpl;
import com.knowledge.wiki.service.entity.PageComment;
import com.knowledge.wiki.service.mapper.PageCommentMapper;
import com.knowledge.wiki.service.service.IPageCommentService;

import cn.hutool.core.collection.CollUtil;
import lombok.extern.slf4j.Slf4j;

/**
 * Page Comment Service Implementation
 */
@Slf4j
@Service
public class PageCommentServiceImpl extends MPJBaseServiceImpl<PageCommentMapper, PageComment>
        implements IPageCommentService {

    @Override
    public PageComment addComment(Long pageId, Long userId, String content, Long parentId, List<Long> mentions) {
        PageComment comment = new PageComment();
        comment.setPageId(pageId);
        comment.setUserId(userId);
        comment.setContent(content);
        comment.setParentId(parentId);
        comment.setMentions(mentions);
        comment.setResolved(false);
        comment.setReactions(new HashMap<>());
        this.save(comment);
        log.info("Comment added: page={}, user={}, parentId={}", pageId, userId, parentId);
        return comment;
    }

    @Override
    public List<PageComment> getPageComments(Long pageId) {
        return lambdaQuery()
                .eq(PageComment::getPageId, pageId)
                .isNull(PageComment::getParentId)
                .orderByAsc(PageComment::getCreateTime)
                .list();
    }

    @Override
    public List<PageComment> getReplies(Long commentId) {
        return lambdaQuery()
                .eq(PageComment::getParentId, commentId)
                .orderByAsc(PageComment::getCreateTime)
                .list();
    }

    @Override
    public void deleteComment(Long commentId, Long userId) {
        PageComment comment = getById(commentId);
        if (comment != null && comment.getUserId().equals(userId)) {
            removeById(commentId);
            log.info("Comment deleted: id={}, user={}", commentId, userId);
        }
    }

    @Override
    public void toggleResolved(Long commentId, Long userId) {
        PageComment comment = getById(commentId);
        if (comment != null) {
            comment.setResolved(!Boolean.TRUE.equals(comment.getResolved()));
            updateById(comment);
            log.info("Comment resolved toggled: id={}, resolved={}", commentId, comment.getResolved());
        }
    }

    @Override
    public void addReaction(Long commentId, Long userId, String emoji) {
        PageComment comment = getById(commentId);
        if (comment == null)
            return;

        Map<String, List<Long>> reactions = comment.getReactions();
        if (reactions == null) {
            reactions = new HashMap<>();
        }

        List<Long> userIds = reactions.computeIfAbsent(emoji, k -> new ArrayList<>());
        if (!userIds.contains(userId)) {
            userIds.add(userId);
            comment.setReactions(reactions);
            updateById(comment);
        }
    }

    @Override
    public void removeReaction(Long commentId, Long userId, String emoji) {
        PageComment comment = getById(commentId);
        if (comment == null)
            return;

        Map<String, List<Long>> reactions = comment.getReactions();
        if (reactions == null)
            return;

        List<Long> userIds = reactions.get(emoji);
        if (userIds != null) {
            userIds.remove(userId);
            if (userIds.isEmpty()) {
                reactions.remove(emoji);
            }
            comment.setReactions(reactions);
            updateById(comment);
        }
    }

    @Override
    public int getCommentCount(Long pageId) {
        Long count = lambdaQuery()
                .eq(PageComment::getPageId, pageId)
                .count();
        return count != null ? count.intValue() : 0;
    }

}
