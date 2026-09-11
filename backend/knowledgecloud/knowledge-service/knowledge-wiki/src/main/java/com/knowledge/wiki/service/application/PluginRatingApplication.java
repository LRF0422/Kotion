package com.knowledge.wiki.service.application;

import java.util.Objects;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.wiki.service.entity.Plugin;
import com.knowledge.wiki.service.entity.PluginRating;
import com.knowledge.wiki.service.entity.dto.PluginRatingDTO;
import com.knowledge.wiki.service.entity.enums.PluginStatus;
import com.knowledge.wiki.service.entity.vo.PluginRatingSummaryVO;
import com.knowledge.wiki.service.exception.WikiException;
import com.knowledge.wiki.service.service.IPluginRatingService;
import com.knowledge.wiki.service.service.IPluginService;

import cn.hutool.core.util.StrUtil;

/**
 * Per-user plugin ratings. One row per (plugin, user); the plugin row keeps the
 * denormalized average and count used by the marketplace.
 */
@Service
public class PluginRatingApplication {

    @Autowired
    private IPluginRatingService pluginRatingService;
    @Autowired
    private IPluginService pluginService;

    @Transactional(rollbackFor = Exception.class)
    public PluginRatingSummaryVO rate(Long pluginId, PluginRatingDTO dto) {
        Long userId = currentUserId();
        Plugin plugin = pluginService.getById(pluginId);
        if (plugin == null || plugin.getStatus() != PluginStatus.DONE
                || Boolean.TRUE.equals(plugin.getSuspended())) {
            throw WikiException.PLUGIN_NOT_FOUND.newException();
        }
        if (Objects.equals(plugin.getDeveloperId(), userId)) {
            throw WikiException.PLUGIN_FORBIDDEN.newException("不能给自己的插件评分");
        }
        PluginRating existing = pluginRatingService.lambdaQuery()
                .eq(PluginRating::getPluginId, pluginId)
                .eq(PluginRating::getUserId, userId)
                .one();
        if (existing == null) {
            PluginRating rating = new PluginRating();
            rating.setPluginId(pluginId);
            rating.setUserId(userId);
            rating.setUserName(StrUtil.trim(SecurityContextUtil.getUserName()));
            rating.setScore(dto.getScore());
            pluginRatingService.save(rating);
        } else {
            existing.setScore(dto.getScore());
            pluginRatingService.updateById(existing);
        }
        recompute(pluginId);
        return summary(pluginId, userId);
    }

    /** Recalculate the marketplace aggregate after a rating change. */
    public void recompute(Long pluginId) {
        long reviews = pluginRatingService.countByPlugin(pluginId);
        double rating = pluginRatingService.averageScore(pluginId);
        pluginService.lambdaUpdate()
                .eq(Plugin::getId, pluginId)
                .set(Plugin::getRating, rating)
                .set(Plugin::getReviews, reviews)
                .update();
    }

    private PluginRatingSummaryVO summary(Long pluginId, Long userId) {
        PluginRatingSummaryVO vo = new PluginRatingSummaryVO();
        vo.setRating(pluginRatingService.averageScore(pluginId));
        vo.setReviews(pluginRatingService.countByPlugin(pluginId));
        if (userId != null && userId > 0) {
            PluginRating mine = pluginRatingService.lambdaQuery()
                    .eq(PluginRating::getPluginId, pluginId)
                    .eq(PluginRating::getUserId, userId)
                    .one();
            vo.setMyScore(mine == null ? null : mine.getScore());
        }
        return vo;
    }

    private Long currentUserId() {
        Long userId = SecurityContextUtil.getUserId();
        if (userId == null || userId <= 0) {
            throw WikiException.PLUGIN_FORBIDDEN.newException();
        }
        return userId;
    }
}
