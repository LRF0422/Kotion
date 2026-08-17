package com.knowledge.agent.core.config;

import com.knowledge.agent.core.loop.AgentLoop;
import com.knowledge.agent.core.supervisor.DefaultRunSupervisor;
import com.knowledge.core.secure.provider.JwtTokenProvider;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Guards the two placement rules that keep the agent service bootable:
 * <ul>
 *   <li>the runtime lives inside {@code com.knowledge.agent.*} (the agent
 *       module's scan base — the application's own component scan registers
 *       everything, no spring.factories);</li>
 *   <li>{@code AgentCoreAutoConfiguration} carries a @ConditionalOnMissingBean
 *       fallback for {@code JwtTokenProvider} (the platform's security stack
 *       requires that bean; the agent module must not scan or modify platform
 *       packages to get it).</li>
 * </ul>
 */
class AgentCoreScanTest {

    @Test
    void runtimeClassesLiveInsideAgentModulePackage() {
        for (Class<?> type : new Class<?>[] {
                AgentLoop.class,
                DefaultRunSupervisor.class,
                com.knowledge.agent.core.web.EditorAgentController.class }) {
            assertTrue(type.getPackage().getName().startsWith("com.knowledge.agent."),
                    type.getName() + " must live inside com.knowledge.agent.*");
        }
    }

    @Test
    void autoConfigurationDoesNotDeclareComponentScan() {
        ComponentScan scan = AgentCoreAutoConfiguration.class.getAnnotation(ComponentScan.class);
        assertFalse(scan != null,
                "no @ComponentScan needed: com.knowledge.agent.core is inside the app scan base");
    }

    @Test
    void autoConfigurationProvidesJwtTokenProviderFallback() throws NoSuchMethodException {
        Method method = AgentCoreAutoConfiguration.class.getMethod("jwtTokenProvider");
        Bean bean = method.getAnnotation(Bean.class);
        assertNotNull(bean, "jwtTokenProvider must be a @Bean method");
        assertEquals(JwtTokenProvider.class, method.getReturnType());
        ConditionalOnMissingBean conditional =
                method.getAnnotation(ConditionalOnMissingBean.class);
        assertNotNull(conditional, "fallback must be @ConditionalOnMissingBean (never override the framework)");
    }

    @Test
    void autoConfigurationDeclaresModuleLocalMapperScan() {
        MapperScan scan = AgentCoreAutoConfiguration.class.getAnnotation(MapperScan.class);
        assertNotNull(scan, "the agent module must register its own mappers (framework scan is not guaranteed)");
        assertEquals("com.knowledge.agent.core.mapper", scan.value()[0]);
    }
}
