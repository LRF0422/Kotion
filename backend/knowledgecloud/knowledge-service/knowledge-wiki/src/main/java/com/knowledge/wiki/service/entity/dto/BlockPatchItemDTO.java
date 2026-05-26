package com.knowledge.wiki.service.entity.dto;

import java.io.Serializable;

import javax.validation.constraints.NotBlank;

import lombok.Data;

/**
 * 单个块级增量变更项 DTO。
 *
 * <p>
 * 由前端 DirtyTracker 在每次自动保存时计算得出，仅包含真正发生变化的顶层块。
 * </p>
 */
@Data
public class BlockPatchItemDTO implements Serializable {

    /**
     * 变更动作：update（新增/更新）或 delete（删除）。
     */
    @NotBlank(message = "变更动作不能为空")
    private String action;

    /**
     * 受影响的块ID。
     */
    @NotBlank(message = "块ID不能为空")
    private String blockId;

    /**
     * 节点类型（如 paragraph、heading）。删除操作时可为空。
     */
    private String type;

    /**
     * 块完整 JSON（包含子节点）。删除操作时可为空。
     * 由前端调用 {@code node.toJSON()} 后再 {@code JSON.stringify} 得到。
     */
    private String content;

    /**
     * 客户端记忆的块版本号——即累积此次变更时块的最新版本。
     * 用于在变更日志中记录确切的 prevVersion，并为后端做乐观并发校验保留扩展点。
     * 新建块或客户端无版本信息时为空。
     */
    private Integer prevVersion;

}
