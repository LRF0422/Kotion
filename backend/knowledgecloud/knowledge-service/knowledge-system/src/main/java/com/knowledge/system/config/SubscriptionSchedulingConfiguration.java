package com.knowledge.system.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * 开启订阅相关定时任务（到期标记）。
 *
 * @author Kotion
 */
@Configuration
@EnableScheduling
public class SubscriptionSchedulingConfiguration {
}
