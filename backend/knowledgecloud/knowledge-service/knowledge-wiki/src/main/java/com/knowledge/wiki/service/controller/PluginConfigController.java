package com.knowledge.wiki.service.controller;

import com.knowledge.core.tool.api.R;
import com.knowledge.core.tool.api.ResultCode;
import com.knowledge.wiki.service.application.PluginConfigApplication;
import com.knowledge.wiki.service.entity.dto.PluginConfigDTO;
import com.knowledge.wiki.service.entity.vo.PluginConfigVO;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.validation.Valid;
import javax.validation.constraints.NotBlank;
import javax.validation.constraints.Pattern;
import javax.validation.constraints.Size;
import java.util.List;

/**
 * Plugin configuration REST API.
 *
 * <p>
 * All endpoints are user-scoped: the authenticated userId is resolved from
 * the JWT by {@code SecurityContextUtil}, so a user can only read and write
 * their own records. {@code pluginKey} is restricted to a conservative charset
 * to prevent injection into future path/query building.
 * </p>
 */
@RestController
@RequestMapping("/plugin-config")
@Validated
public class PluginConfigController {

    /**
     * Allowed charset for a pluginKey: letters, digits, dash, dot and underscore.
     */
    private static final String PLUGIN_KEY_PATTERN = "^[A-Za-z0-9._-]+$";

    @Autowired
    private PluginConfigApplication pluginConfigApplication;

    /**
     * Get single plugin config.
     *
     * <p>
     * Returns HTTP 200 with a 404 business code (and {@code data=null}) when
     * no config has been saved yet for the current user and the given key, so
     * the frontend can fall back to local storage or a default config.
     * </p>
     */
    @GetMapping("/{pluginKey}")
    public R<PluginConfigVO> getPluginConfig(
            @PathVariable("pluginKey") @NotBlank(message = "pluginKey cannot be blank") @Size(max = 128, message = "pluginKey length must be <= 128") @Pattern(regexp = PLUGIN_KEY_PATTERN, message = "pluginKey contains illegal characters") String pluginKey) {
        PluginConfigVO vo = pluginConfigApplication.getPluginConfig(pluginKey);
        if (vo == null) {
            return R.fail(ResultCode.NOT_FOUND.getCode(), "Plugin config not found");
        }
        return R.data(vo);
    }

    /**
     * Save/Update plugin config (UPSERT semantics).
     */
    @PostMapping("/{pluginKey}")
    public R<PluginConfigVO> savePluginConfig(
            @PathVariable("pluginKey") @NotBlank(message = "pluginKey cannot be blank") @Size(max = 128, message = "pluginKey length must be <= 128") @Pattern(regexp = PLUGIN_KEY_PATTERN, message = "pluginKey contains illegal characters") String pluginKey,
            @Valid @RequestBody PluginConfigDTO dto) {
        PluginConfigVO savedConfig = pluginConfigApplication.savePluginConfig(pluginKey, dto.getConfig());
        return R.data(savedConfig);
    }

    /**
     * Get all plugin configs for the current user.
     */
    @GetMapping
    public R<List<PluginConfigVO>> getAllPluginConfigs() {
        return R.data(pluginConfigApplication.getAllPluginConfigs());
    }
}
