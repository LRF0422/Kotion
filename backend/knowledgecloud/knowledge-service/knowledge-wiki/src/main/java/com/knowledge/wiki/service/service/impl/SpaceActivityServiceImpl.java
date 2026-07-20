package com.knowledge.wiki.service.service.impl;

import java.util.List;
import java.util.Map;

import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.github.yulichang.base.MPJBaseServiceImpl;
import com.knowledge.wiki.service.entity.SpaceActivity;
import com.knowledge.wiki.service.mapper.SpaceActivityMapper;
import com.knowledge.wiki.service.service.ISpaceActivityService;

import lombok.extern.slf4j.Slf4j;

/**
 * Space Activity Service Implementation
 */
@Slf4j
@Service
public class SpaceActivityServiceImpl extends MPJBaseServiceImpl<SpaceActivityMapper, SpaceActivity>
        implements ISpaceActivityService {

    @Override
    @Async
    public SpaceActivity recordActivity(Long spaceId, Long userId, String actionType,
            String targetType, String targetId, Map<String, Object> metadata) {
        SpaceActivity activity = new SpaceActivity();
        activity.setSpaceId(spaceId);
        activity.setUserId(userId);
        activity.setActionType(actionType);
        activity.setTargetType(targetType);
        activity.setTargetId(targetId);
        activity.setMetadata(metadata);
        this.save(activity);
        log.debug("Recorded activity: space={}, user={}, action={}, target={}/{}",
                spaceId, userId, actionType, targetType, targetId);
        return activity;
    }

    @Override
    public List<SpaceActivity> getSpaceActivities(Long spaceId, int page, int pageSize) {
        Page<SpaceActivity> pager = new Page<>(page, pageSize);
        return lambdaQuery()
                .eq(SpaceActivity::getSpaceId, spaceId)
                .orderByDesc(SpaceActivity::getCreateTime)
                .page(pager)
                .getRecords();
    }

    @Override
    public List<SpaceActivity> getSpaceActivitiesByType(Long spaceId, String actionType, int page, int pageSize) {
        Page<SpaceActivity> pager = new Page<>(page, pageSize);
        return lambdaQuery()
                .eq(SpaceActivity::getSpaceId, spaceId)
                .eq(SpaceActivity::getActionType, actionType)
                .orderByDesc(SpaceActivity::getCreateTime)
                .page(pager)
                .getRecords();
    }

    @Override
    public long getActivityCount(Long spaceId) {
        return lambdaQuery()
                .eq(SpaceActivity::getSpaceId, spaceId)
                .count();
    }

}
