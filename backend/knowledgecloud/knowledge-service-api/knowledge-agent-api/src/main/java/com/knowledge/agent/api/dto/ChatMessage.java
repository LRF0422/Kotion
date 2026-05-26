package com.knowledge.agent.api.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@ApiModel("Chat message")
public class ChatMessage {

    @ApiModelProperty("Role: system | user | assistant | tool")
    private String role;

    @ApiModelProperty("Message content")
    private String content;

    @ApiModelProperty("Tool call id (for role=tool)")
    @JsonProperty("tool_call_id")
    private String toolCallId;

    @ApiModelProperty("Function name (optional, for tool responses)")
    private String name;

    @ApiModelProperty("Tool calls (for role=assistant when calling tools)")
    @JsonProperty("tool_calls")
    private List<ToolCallInfo> toolCalls;

    @ApiModelProperty("Chain-of-thought reasoning content from thinking mode (for role=assistant, DeepSeek requires this to be passed back when tool_calls are present)")
    @JsonProperty("reasoning_content")
    private String reasoningContent;

    /**
     * Tool call info for assistant messages with tool calls.
     */
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ToolCallInfo {
        private String id;
        private String type;
        private FunctionInfo function;

        /**
         * Function info containing name and arguments.
         */
        @Data
        @NoArgsConstructor
        @AllArgsConstructor
        public static class FunctionInfo {
            private String name;
            private String arguments;
        }
    }
}
