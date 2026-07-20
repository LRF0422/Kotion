package com.knowledge.wiki.service.application;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.core.tool.api.R;
import com.knowledge.system.feign.IUserClient;
import com.knowledge.wiki.service.entity.SpaceActivity;
import com.knowledge.wiki.service.entity.dto.SpaceActivityDTO;
import com.knowledge.wiki.service.service.ISpaceActivityService;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.collection.ListUtil;
import lombok.extern.slf4j.Slf4j;

/**
 * Space Activity Application Service
 * Business logic for activity feed
 */
@Slf4j
@Service
public class SpaceActivityApplication {

    @Autowired
    private ISpaceActivityService spaceActivityService;

    @Autowired
    private IUserClient userClient;

    /**
     * Get activity feed for a space (paginated)
     */
    public List<SpaceActivityDTO> getActivities(Long spaceId, int page, int pageSize, String actionType) {
        List<SpaceActivity> activities;
        if (actionType != null && !actionType.isEmpty()) {
            activities = spaceActivityService.getSpaceActivitiesByType(spaceId, actionType, page, pageSize);
        } else {
            activities = spaceActivityService.getSpaceActivities(spaceId, page, pageSize);
        }

        if (CollUtil.isEmpty(activities)) {
            return ListUtil.empty();
        }

        // Resolve user details
        List<Long> userIds = activities.stream()
                .map(SpaceActivity::getUserId)
                .distinct()
                .collect(Collectors.toList());
        R<List<KnowledgeUser>> usersRes = userClient.listByIds(userIds);
        Map<Long, KnowledgeUser> userMap = new HashMap<>();
        if (usersRes.getData() != null) {
            userMap = usersRes.getData().stream()
                    .collect(Collectors.toMap(KnowledgeUser::getUserId, u -> u, (a, b) -> a));
        }

        Map<Long, KnowledgeUser> finalUserMap = userMap;
        return activities.stream()
                .map(activity -> {
                    SpaceActivityDTO dto = new SpaceActivityDTO();
                    dto.setId(activity.getId());
                    dto.setSpaceId(activity.getSpaceId());
                    dto.setUserId(activity.getUserId());
                    dto.setActionType(activity.getActionType());
                    dto.setTargetType(activity.getTargetType());
                    dto.setTargetId(activity.getTargetId());
                    dto.setMetadata(activity.getMetadata());
                    dto.setCreatedAt(activity.getCreateTime());

                    KnowledgeUser user = finalUserMap.get(activity.getUserId());
                    if (user != null) {
                        dto.setUserName(user.getUserName());
                        // dto.setUserAvatar(user.geta());
                    }
                    return dto;
                })
                .collect(Collectors.toList());
    }

    /**
     * Record a page activity
     */
    public void recordPageActivity(Long spaceId, String actionType, Long pageId, String pageTitle) {
        Long userId = SecurityContextUtil.getUserId();
        Map<String, Object> metadata = new HashMap<>();
        metadata.put("pageTitle", pageTitle);
        spaceActivityService.recordActivity(spaceId, userId, actionType, "PAGE", String.valueOf(pageId), metadata);
    }

    /**
     * Record a member activity
     */
    public void recordMemberActivity(Long spaceId, String actionType, Long targetUserId, Map<String, Object> extra) {
        Long userId = SecurityContextUtil.getUserId();
        Map<String, Object> metadata = extra != null ? new HashMap<>(extra) : new HashMap<>();
        spaceActivityService.recordActivity(spaceId, userId, actionType, "MEMBER", String.valueOf(targetUserId),
                metadata);
    }

    /**
     * Record a comment activity
     */
    public void recordCommentActivity(Long spaceId, Long pageId, Long commentId, String pageTitle) {
        Long userId = SecurityContextUtil.getUserId();
        Map<String, Object> metadata = new HashMap<>();
        metadata.put("pageTitle", pageTitle);
        metadata.put("pageId", pageId);
        spaceActivityService.recordActivity(spaceId, userId, "COMMENT_ADDED", "COMMENT", String.valueOf(commentId),
                metadata);
    }

}
