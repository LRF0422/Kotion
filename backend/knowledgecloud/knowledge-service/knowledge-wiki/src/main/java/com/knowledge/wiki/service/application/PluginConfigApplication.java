package com.knowledge.wiki.service.application;

import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.api.ResultCode;
import com.knowledge.core.tool.utils.Func;
import com.knowledge.wiki.service.converter.PluginConfigConverter;
import com.knowledge.wiki.service.entity.PluginConfig;
import com.knowledge.wiki.service.entity.vo.PluginConfigVO;
import com.knowledge.wiki.service.service.IPluginConfigService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@Slf4j
public class PluginConfigApplication {

    @Autowired
    private IPluginConfigService pluginConfigService;

    /**
     * Get a single plugin config.
     * Returns {@code null} when the record does not exist so that the controller
     * layer can translate it into an HTTP 404 response, matching the documented
     * API contract.
     */
    public PluginConfigVO getPluginConfig(String pluginKey) {
        Long userId = requireUserId();
        log.debug("Getting plugin config for user: {}, pluginKey: {}", userId, pluginKey);

        PluginConfig config = pluginConfigService.getByUserIdAndPluginKey(userId, pluginKey);
        if (config == null) {
            return null;
        }
        return PluginConfigConverter.INSTANCE.convertVO(config);
    }

    public PluginConfigVO savePluginConfig(String pluginKey, Map<String, Object> config) {
        Long userId = requireUserId();
        log.info("Saving plugin config for user: {}, pluginKey: {}", userId, pluginKey);

        PluginConfig savedConfig = pluginConfigService.saveOrUpdate(userId, pluginKey, config);
        log.info("Plugin config saved successfully for pluginKey: {}", pluginKey);

        return PluginConfigConverter.INSTANCE.convertVO(savedConfig);
    }

    public List<PluginConfigVO> getAllPluginConfigs() {
        Long userId = requireUserId();
        log.debug("Getting all plugin configs for user: {}", userId);

        List<PluginConfig> configs = pluginConfigService.getAllByUserId(userId);

        return configs.stream()
                .map(PluginConfigConverter.INSTANCE::convertVO)
                .collect(Collectors.toList());
    }

    /**
     * Ensure an authenticated user context exists before touching plugin configs.
     */
    private Long requireUserId() {
        Long userId = SecurityContextUtil.getUserId();
        if (Func.isNull(userId) || userId <= 0L) {
            throw new ResponseStatusException(
                    org.springframework.http.HttpStatus.UNAUTHORIZED,
                    ResultCode.UN_AUTHORIZED.getMessage());
        }
        return userId;
    }
}
