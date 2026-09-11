package com.knowledge.wiki.service.application;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.knowledge.core.message.feign.IMessageClient;
import com.knowledge.wiki.service.entity.Plugin;
import com.knowledge.wiki.service.entity.PluginVersion;
import com.knowledge.wiki.service.entity.enums.PluginReviewDecision;
import com.knowledge.wiki.service.entity.enums.PluginReviewReason;

import cn.hutool.core.util.StrUtil;
import lombok.extern.slf4j.Slf4j;

/**
 * Best-effort developer notification for plugin review decisions. Delivery never
 * fails the review: message-service errors are logged and swallowed, with a
 * websocket-only fallback when the persisted instant message cannot be stored.
 */
@Component
@Slf4j
public class PluginReviewNotifier {

    private static final String MESSAGE_TYPE = "PLUGIN_REVIEW";

    @Autowired(required = false)
    private IMessageClient messageClient;

    public void notifyDecision(Long reviewerId, Plugin plugin, PluginVersion version,
            PluginReviewDecision decision, String reason, PluginReviewReason reasonCode) {
        if (messageClient == null || plugin == null || decision == null) {
            return;
        }
        Long developerId = plugin.getDeveloperId();
        if (developerId == null || developerId <= 0 || developerId.equals(reviewerId)) {
            return;
        }
        boolean approved = decision == PluginReviewDecision.APPROVE;
        String versionLabel = version == null || StrUtil.isBlank(version.getVersion())
                ? "" : " v" + version.getVersion();

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("type", "PLUGIN_REVIEW");
        data.put("decision", decision.name());
        data.put("pluginId", plugin.getId());
        data.put("pluginKey", plugin.getPluginKey());
        data.put("pluginName", plugin.getName());
        data.put("version", version == null ? null : version.getVersion());
        data.put("reason", StrUtil.trim(reason));
        data.put("reasonCode", reasonCode == null ? null : reasonCode.getValue());

        StringBuilder content = new StringBuilder()
                .append("插件「").append(plugin.getName()).append("」").append(versionLabel)
                .append(approved ? "已通过审核" : "未通过审核");
        if (StrUtil.isNotBlank(reason)) {
            content.append("：").append(StrUtil.trim(reason));
        }
        try {
            messageClient.sendInstantMessage(reviewerId, developerId, content.toString(), MESSAGE_TYPE, data);
        } catch (Exception ex) {
            log.warn("Failed to persist plugin review notification for plugin {}", plugin.getId(), ex);
            try {
                messageClient.sendWebSocketNotification(developerId, "NOTIFICATION", data);
            } catch (Exception fallback) {
                log.warn("Fallback websocket notification failed for plugin {}", plugin.getId(), fallback);
            }
        }
    }

    public void notifyTakedown(Long operatorId, Plugin plugin, boolean suspended, String reason) {
        if (messageClient == null || plugin == null) {
            return;
        }
        Long developerId = plugin.getDeveloperId();
        if (developerId == null || developerId <= 0 || developerId.equals(operatorId)) {
            return;
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("type", suspended ? "PLUGIN_SUSPENDED" : "PLUGIN_RESTORED");
        data.put("pluginId", plugin.getId());
        data.put("pluginKey", plugin.getPluginKey());
        data.put("pluginName", plugin.getName());
        data.put("reason", StrUtil.trim(reason));

        String content = "插件「" + plugin.getName() + "」已" + (suspended ? "下架" : "恢复上架")
                + (StrUtil.isNotBlank(reason) ? "：" + StrUtil.trim(reason) : "");
        try {
            messageClient.sendInstantMessage(operatorId, developerId, content, MESSAGE_TYPE, data);
        } catch (Exception ex) {
            log.warn("Failed to persist plugin takedown notification for plugin {}", plugin.getId(), ex);
            try {
                messageClient.sendWebSocketNotification(developerId, "NOTIFICATION", data);
            } catch (Exception fallback) {
                log.warn("Fallback websocket notification failed for plugin {}", plugin.getId(), fallback);
            }
        }
    }
}
