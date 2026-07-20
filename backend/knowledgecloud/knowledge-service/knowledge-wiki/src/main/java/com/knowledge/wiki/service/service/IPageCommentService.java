package com.knowledge.wiki.service.service;

import java.util.List;
import java.util.Map;

import com.github.yulichang.base.MPJBaseService;
import com.knowledge.wiki.service.entity.PageComment;

/**
 * Page Comment Service Interface
 * Manages comments on wiki pages
 */
public interface IPageCommentService extends MPJBaseService<PageComment> {

    /**
     * Add a comment to a page
     */
    PageComment addComment(Long pageId, Long userId, String content, Long parentId, List<Long> mentions);

    /**
     * Get comments for a page (top-level, ordered by time asc)
     */
    List<PageComment> getPageComments(Long pageId);

    /**
     * Get replies to a comment
     */
    List<PageComment> getReplies(Long commentId);

    /**
     * Delete a comment (soft delete)
     */
    void deleteComment(Long commentId, Long userId);

    /**
     * Toggle resolved status on a comment
     */
    void toggleResolved(Long commentId, Long userId);

    /**
     * Add a reaction to a comment
     */
    void addReaction(Long commentId, Long userId, String emoji);

    /**
     * Remove a reaction from a comment
     */
    void removeReaction(Long commentId, Long userId, String emoji);

    /**
     * Get comment count for a page
     */
    int getCommentCount(Long pageId);

}
