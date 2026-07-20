package com.knowledge.wiki.service.service;

import java.util.List;
import java.util.Map;

import com.github.yulichang.base.MPJBaseService;
import com.knowledge.wiki.service.entity.SpaceActivity;

/**
 * Space Activity Service Interface
 * Manages activity feed for team spaces
 */
public interface ISpaceActivityService extends MPJBaseService<SpaceActivity> {

    /**
     * Record an activity event
     */
    SpaceActivity recordActivity(Long spaceId, Long userId, String actionType,
            String targetType, String targetId, Map<String, Object> metadata);

    /**
     * Get activities for a space (paginated, ordered by time desc)
     */
    List<SpaceActivity> getSpaceActivities(Long spaceId, int page, int pageSize);

    /**
     * Get activities for a space filtered by action type
     */
    List<SpaceActivity> getSpaceActivitiesByType(Long spaceId, String actionType, int page, int pageSize);

    /**
     * Get total activity count for a space
     */
    long getActivityCount(Long spaceId);

}
