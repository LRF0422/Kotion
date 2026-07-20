package com.knowledge.wiki.service.application;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.knowledge.core.message.feign.IMessageClient;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.core.tool.api.R;
import com.knowledge.system.feign.IUserClient;
import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.PageComment;
import com.knowledge.wiki.service.entity.dto.CreateCommentDTO;
import com.knowledge.wiki.service.entity.dto.PageCommentDTO;
import com.knowledge.wiki.service.service.IPageCommentService;
import com.knowledge.wiki.service.service.IPageService;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.collection.ListUtil;
import lombok.extern.slf4j.Slf4j;

/**
 * Page Comment Application Service
 * Business logic for page comments with @mentions and notifications
 */
@Slf4j
@Service
public class PageCommentApplication {

    @Autowired
    private IPageCommentService pageCommentService;

    @Autowired
    private IPageService pageService;

    @Autowired
    private IUserClient userClient;

    @Autowired
    private IMessageClient messageClient;

    @Autowired
    private SpaceActivityApplication spaceActivityApplication;

    /**
     * Get comments for a page with user details and nested replies
     */
    public List<PageCommentDTO> getPageComments(Long pageId) {
        List<PageComment> topLevel = pageCommentService.getPageComments(pageId);
        if (CollUtil.isEmpty(topLevel)) {
            return ListUtil.empty();
        }

        // Collect all user IDs to resolve
        List<Long> allUserIds = new ArrayList<>();
        List<PageComment> allReplies = new ArrayList<>();

        for (PageComment comment : topLevel) {
            allUserIds.add(comment.getUserId());
            List<PageComment> replies = pageCommentService.getReplies(comment.getId());
            allReplies.addAll(replies);
            for (PageComment reply : replies) {
                allUserIds.add(reply.getUserId());
            }
        }

        // Resolve users
        Map<Long, KnowledgeUser> userMap = resolveUsers(allUserIds.stream().distinct().collect(Collectors.toList()));

        // Build DTOs
        Map<Long, List<PageComment>> repliesMap = allReplies.stream()
                .collect(Collectors.groupingBy(PageComment::getParentId));

        return topLevel.stream()
                .map(comment -> buildCommentDTO(comment, repliesMap, userMap))
                .collect(Collectors.toList());
    }

    /**
     * Add a comment
     */
    public PageCommentDTO addComment(CreateCommentDTO dto) {
        Long userId = SecurityContextUtil.getUserId();
        PageComment comment = pageCommentService.addComment(
                dto.getPageId(), userId, dto.getContent(), dto.getParentId(), dto.getMentions());

        // Send notifications for @mentions
        if (CollUtil.isNotEmpty(dto.getMentions())) {
            notifyMentionedUsers(dto.getPageId(), userId, dto.getMentions(), dto.getContent());
        }

        // Record activity
        Page page = pageService.getById(dto.getPageId());
        if (page != null && page.getSpaceId() != null) {
            try {
                spaceActivityApplication.recordCommentActivity(
                        page.getSpaceId(), dto.getPageId(), comment.getId(), page.getTitle());
            } catch (Exception e) {
                log.warn("Failed to record comment activity", e);
            }
        }

        // Resolve user and build response
        Map<Long, KnowledgeUser> userMap = resolveUsers(java.util.Collections.singletonList(userId));
        return buildCommentDTO(comment, java.util.Collections.emptyMap(), userMap);
    }

    /**
     * Delete a comment
     */
    public void deleteComment(Long commentId) {
        Long userId = SecurityContextUtil.getUserId();
        pageCommentService.deleteComment(commentId, userId);
    }

    /**
     * Toggle resolved status
     */
    public void toggleResolved(Long commentId) {
        Long userId = SecurityContextUtil.getUserId();
        pageCommentService.toggleResolved(commentId, userId);
    }

    /**
     * Add a reaction
     */
    public void addReaction(Long commentId, String emoji) {
        Long userId = SecurityContextUtil.getUserId();
        pageCommentService.addReaction(commentId, userId, emoji);
    }

    /**
     * Remove a reaction
     */
    public void removeReaction(Long commentId, String emoji) {
        Long userId = SecurityContextUtil.getUserId();
        pageCommentService.removeReaction(commentId, userId, emoji);
    }

    /**
     * Get comment count for a page
     */
    public int getCommentCount(Long pageId) {
        return pageCommentService.getCommentCount(pageId);
    }

    // --- Private helpers ---

    private void notifyMentionedUsers(Long pageId, Long senderId, List<Long> mentionedUserIds, String commentContent) {
        try {
            Page page = pageService.getById(pageId);
            String pageTitle = page != null ? page.getTitle() : "Unknown Page";

            for (Long mentionedUserId : mentionedUserIds) {
                if (!mentionedUserId.equals(senderId)) {
                    Map<String, Object> data = new HashMap<>();
                    data.put("type", "MENTION");
                    data.put("pageId", pageId);
                    data.put("pageTitle", pageTitle);
                    data.put("content", commentContent.length() > 100
                            ? commentContent.substring(0, 100) + "..."
                            : commentContent);
                    messageClient.sendWebSocketNotification(mentionedUserId, "NOTIFICATION", data);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to send mention notifications for page {}", pageId, e);
        }
    }

    private Map<Long, KnowledgeUser> resolveUsers(List<Long> userIds) {
        if (CollUtil.isEmpty(userIds))
            return java.util.Collections.emptyMap();
        R<List<KnowledgeUser>> usersRes = userClient.listByIds(userIds);
        if (usersRes.getData() == null)
            return java.util.Collections.emptyMap();
        return usersRes.getData().stream()
                .collect(Collectors.toMap(KnowledgeUser::getUserId, u -> u, (a, b) -> a));
    }

    private PageCommentDTO buildCommentDTO(PageComment comment, Map<Long, List<PageComment>> repliesMap,
            Map<Long, KnowledgeUser> userMap) {
        PageCommentDTO dto = new PageCommentDTO();
        dto.setId(comment.getId());
        dto.setPageId(comment.getPageId());
        dto.setUserId(comment.getUserId());
        dto.setContent(comment.getContent());
        dto.setParentId(comment.getParentId());
        dto.setMentions(comment.getMentions());
        dto.setReactions(comment.getReactions());
        dto.setResolved(comment.getResolved());
        dto.setCreatedAt(comment.getCreateTime());
        dto.setUpdatedAt(comment.getUpdateTime());

        KnowledgeUser user = userMap.get(comment.getUserId());
        if (user != null) {
            dto.setUserName(user.getUserName());
            // dto.setUserAvatar(user.getAvatar());
        }

        // Attach replies for top-level comments
        List<PageComment> replies = repliesMap.get(comment.getId());
        if (CollUtil.isNotEmpty(replies)) {
            dto.setReplies(replies.stream()
                    .map(r -> buildCommentDTO(r, java.util.Collections.emptyMap(), userMap))
                    .collect(Collectors.toList()));
        }

        return dto;
    }

}
