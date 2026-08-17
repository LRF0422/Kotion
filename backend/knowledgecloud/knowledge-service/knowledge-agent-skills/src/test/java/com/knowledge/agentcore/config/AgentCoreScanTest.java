package com.knowledge.agentcore.config;

import com.knowledge.core.secure.config.SecureConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.ComponentScan;

import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * Guards the two component-scan declarations that keep the agent service
 * bootable:
 * <ul>
 *   <li>{@code com.knowledge.agentcore} — the agent runtime itself (the 404 fix);</li>
 *   <li>{@code com.knowledge.core.secure} — registers {@code JwtTokenProvider}
 *       (the "required a bean of type JwtTokenProvider" boot failure).</li>
 * </ul>
 */
class AgentCoreScanTest {

    @Test
    void agentCoreAutoConfigurationScansRuntimeAndSecurePackages() {
        ComponentScan scan = AgentCoreAutoConfiguration.class.getAnnotation(ComponentScan.class);
        assertNotNull(scan, "AgentCoreAutoConfiguration must declare @ComponentScan");
        String[] packages = scan.basePackages();
        assertArrayEquals(new String[] { "com.knowledge.agentcore", "com.knowledge.core.secure" },
                Arrays.stream(packages).sorted().toArray(String[]::new));
    }

    @Test
    void secureConfigurationScansItsOwnPackageTree() {
        ComponentScan scan = SecureConfiguration.class.getAnnotation(ComponentScan.class);
        assertNotNull(scan, "SecureConfiguration must declare @ComponentScan");
        assertArrayEquals(new String[] { "com.knowledge.core.secure" }, scan.basePackages());
    }
}
