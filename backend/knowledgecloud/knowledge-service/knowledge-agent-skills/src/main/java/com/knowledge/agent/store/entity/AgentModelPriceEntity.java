package com.knowledge.agent.store.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * MyBatis-Plus entity for the {@code agent_model_price} table.
 *
 * <p>
 * Stores the unit price (per 1K tokens) of each model, maintained by
 * platform admins and used to convert token usage into cost.
 */
@Data
@TableName("agent_model_price")
public class AgentModelPriceEntity implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** Model name, unique key (e.g. gpt-4o, qwen-max). */
    private String modelName;

    /** Price per 1K prompt tokens. */
    private BigDecimal promptPrice;

    /** Price per 1K completion tokens. */
    private BigDecimal completionPrice;

    /** Currency code, defaults to CNY. */
    private String currency;

    private String remark;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
