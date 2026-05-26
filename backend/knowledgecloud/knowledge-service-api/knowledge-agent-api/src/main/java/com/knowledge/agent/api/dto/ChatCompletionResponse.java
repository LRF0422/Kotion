package com.knowledge.agent.api.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import io.swagger.annotations.ApiModel;
import io.swagger.annotations.ApiModelProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Chat completion response DTO (OpenAI-compatible).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@ApiModel("Chat completion response")
public class ChatCompletionResponse {

    @ApiModelProperty("Response id")
    private String id;

    @ApiModelProperty("Object type")
    private String object;

    @ApiModelProperty("Created timestamp")
    private Long created;

    @ApiModelProperty("Model used")
    private String model;

    @ApiModelProperty("Choices")
    private List<Choice> choices;

    @ApiModelProperty("Usage statistics")
    private Usage usage;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Choice {

        @ApiModelProperty("Choice index")
        private Integer index;

        @ApiModelProperty("Message")
        private ChatMessage message;

        @ApiModelProperty("Finish reason: stop | length | content_filter | tool_calls")
        @JsonProperty("finish_reason")
        private String finishReason;

        @ApiModelProperty("Tool calls")
        @JsonProperty("tool_calls")
        private List<ToolCall> toolCalls;
    }

    /**
     * Tool call in assistant response.
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ToolCall {

        @ApiModelProperty("Tool call ID")
        private String id;

        @ApiModelProperty("Type (always 'function')")
        private String type;

        @ApiModelProperty("Function details")
        private ChatFunction function;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Usage {

        @ApiModelProperty("Prompt tokens")
        @JsonProperty("prompt_tokens")
        private Integer promptTokens;

        @ApiModelProperty("Completion tokens")
        @JsonProperty("completion_tokens")
        private Integer completionTokens;

        @ApiModelProperty("Total tokens")
        @JsonProperty("total_tokens")
        private Integer totalTokens;
    }
}
