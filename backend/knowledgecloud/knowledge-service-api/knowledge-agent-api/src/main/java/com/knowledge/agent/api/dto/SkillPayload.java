package com.knowledge.agent.api.dto;

import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Payload representing a skill sent from the frontend for progressive
 * skill discovery by the backend agent.
 *
 * <p>
 * Matches the frontend {@code SkillPayload} interface:
 * 
 * <pre>
 * interface SkillPayload {
 *     name: string                    // unique skill id
 *     description: string
 *     requiredTools: string[]         // tool names this skill needs to operate
 *     optionalTools?: string[]
 *     tools?: ChatTool[]              // full OpenAI-compatible tool definitions provided by the frontend
 *     systemPromptFragment?: string   // prompt snippet to splice in when activated
 *     tags?: string[]
 *     source: 'builtin' | 'plugin' | 'user'
 *     pluginName?: string             // set when source is 'plugin' or 'user'
 * }
 * </pre>
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@ApiModel("Skill payload from frontend for progressive discovery")
public class SkillPayload {

    @ApiModelProperty(value = "Unique skill id", example = "translation", required = true)
    private String name;

    @ApiModelProperty(value = "Skill description", required = true)
    private String description;

    @ApiModelProperty("Tool names this skill needs to operate (legacy, superseded by tools)")
    private List<String> requiredTools;

    @ApiModelProperty("Optional tool names that enhance the skill (legacy, superseded by tools)")
    private List<String> optionalTools;

    @ApiModelProperty("Full OpenAI-compatible tool definitions for this skill; merged into frontendTools when the skill is activated")
    private List<ChatTool> tools;

    @ApiModelProperty("Prompt snippet to splice in when the skill activates")
    private String systemPromptFragment;

    @ApiModelProperty("Tags for categorization and matching")
    private List<String> tags;

    @ApiModelProperty("Skill domain for deterministic pre-filtering (e.g., 'wiki', 'search', 'translation', 'data')")
    private String domain;

    @ApiModelProperty(value = "Skill source", allowableValues = "builtin,plugin,user", required = true)
    private String source;

    @ApiModelProperty("Plugin name, set when source is 'plugin' or 'user'")
    private String pluginName;
}
