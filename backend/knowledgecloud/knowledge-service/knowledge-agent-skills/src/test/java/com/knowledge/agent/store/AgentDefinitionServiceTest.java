package com.knowledge.agent.store;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.knowledge.agent.store.entity.AgentDefinitionEntity;
import com.knowledge.agent.store.mapper.AgentDefinitionMapper;
import com.knowledge.agent.v2.tool.CustomAgentResolver;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Collections;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link AgentDefinitionService}: validation, tenant-scoped
 * CRUD, and entity → {@code CustomAgentSpec} assembly.
 */
class AgentDefinitionServiceTest {

    private static final Long TENANT = 7L;
    private static final Long USER = 42L;

    private AgentDefinitionMapper mapper;
    private AgentDefinitionService service;

    @BeforeAll
    static void initMybatisPlusTableCache() {
        // LambdaQueryWrapper column resolution requires the entity's table
        // info to be registered (normally done by the MP starter at boot).
        TableInfoHelper.initTableInfo(
                new MapperBuilderAssistant(new MybatisConfiguration(), ""),
                AgentDefinitionEntity.class);
    }

    @BeforeEach
    void setUp() {
        mapper = mock(AgentDefinitionMapper.class);
        service = new AgentDefinitionService(mapper, new ObjectMapper());
    }

    private AgentDefinitionEntity validEntity() {
        AgentDefinitionEntity entity = new AgentDefinitionEntity();
        entity.setName("researcher");
        entity.setDescription("检索专家");
        entity.setSystemPrompt("you are a researcher");
        entity.setModelName("deepseek-chat");
        entity.setToolIds("[\"web_search\",\"web_fetch\"]");
        entity.setMaxIterations(10);
        return entity;
    }

    // ---- create ----

    @Test
    void createRejectsInvalidInput() {
        AgentDefinitionEntity noName = validEntity();
        noName.setName("  ");
        assertThatThrownBy(() -> service.create(noName, TENANT, USER))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("name is required");

        AgentDefinitionEntity noPrompt = validEntity();
        noPrompt.setSystemPrompt(null);
        assertThatThrownBy(() -> service.create(noPrompt, TENANT, USER))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("System prompt is required");

        AgentDefinitionEntity longName = validEntity();
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 65; i++) {
            sb.append('x');
        }
        longName.setName(sb.toString());
        assertThatThrownBy(() -> service.create(longName, TENANT, USER))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("too long");

        AgentDefinitionEntity badIterations = validEntity();
        badIterations.setMaxIterations(0);
        assertThatThrownBy(() -> service.create(badIterations, TENANT, USER))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("maxIterations");

        verify(mapper, never()).insert(any());
    }

    @Test
    void createRejectsDuplicateNameWithinTenant() {
        when(mapper.selectCount(any())).thenReturn(1L);
        assertThatThrownBy(() -> service.create(validEntity(), TENANT, USER))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("already exists");
        verify(mapper, never()).insert(any());
    }

    @Test
    void createStampsTenantOwnershipAndDefaults() {
        when(mapper.selectCount(any())).thenReturn(0L);
        AgentDefinitionEntity entity = validEntity();
        entity.setId(999L); // client-supplied id must be ignored
        entity.setEnabled(null); // defaults to enabled

        service.create(entity, TENANT, USER);

        ArgumentCaptor<AgentDefinitionEntity> captor = ArgumentCaptor.forClass(AgentDefinitionEntity.class);
        verify(mapper).insert(captor.capture());
        AgentDefinitionEntity inserted = captor.getValue();
        assertThat(inserted.getId()).isNull();
        assertThat(inserted.getTenantId()).isEqualTo(TENANT);
        assertThat(inserted.getUserId()).isEqualTo(USER);
        assertThat(inserted.getEnabled()).isTrue();
    }

    // ---- update / delete (tenant isolation via scoped lookup) ----

    @Test
    void updateThrowsWhenNotVisibleInTenant() {
        when(mapper.selectOne(any())).thenReturn(null); // other tenant / missing
        assertThatThrownBy(() -> service.update(5L, validEntity(), TENANT))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("not found");
        verify(mapper, never()).updateById(any());
    }

    @Test
    void updateAppliesChangesAndKeepsEnabledWhenOmitted() {
        AgentDefinitionEntity existing = validEntity();
        existing.setId(5L);
        existing.setTenantId(TENANT);
        existing.setEnabled(true);
        when(mapper.selectOne(any())).thenReturn(existing);
        when(mapper.selectCount(any())).thenReturn(0L);

        AgentDefinitionEntity changes = validEntity();
        changes.setName("analyst");
        changes.setSystemPrompt("you are an analyst");
        changes.setEnabled(null); // omitted → keep existing value

        AgentDefinitionEntity updated = service.update(5L, changes, TENANT);

        verify(mapper).updateById(existing);
        assertThat(updated.getName()).isEqualTo("analyst");
        assertThat(updated.getSystemPrompt()).isEqualTo("you are an analyst");
        assertThat(updated.getEnabled()).isTrue();
        assertThat(updated.getTenantId()).isEqualTo(TENANT);
    }

    @Test
    void deleteThrowsWhenNotVisibleInTenant() {
        when(mapper.selectOne(any())).thenReturn(null);
        assertThatThrownBy(() -> service.delete(5L, TENANT))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("not found");
        verify(mapper, never()).deleteById(any(java.io.Serializable.class));
    }

    @Test
    void deleteRemovesVisibleDefinition() {
        AgentDefinitionEntity existing = validEntity();
        existing.setId(5L);
        when(mapper.selectOne(any())).thenReturn(existing);

        service.delete(5L, TENANT);

        verify(mapper).deleteById(5L);
    }

    // ---- CustomAgentResolver assembly ----

    @Test
    void resolveMapsEntityToSpec() {
        AgentDefinitionEntity entity = validEntity();
        when(mapper.selectOne(any())).thenReturn(entity);

        Optional<CustomAgentResolver.CustomAgentSpec> resolved = service.resolve("researcher", TENANT);

        assertThat(resolved).isPresent();
        CustomAgentResolver.CustomAgentSpec spec = resolved.get();
        assertThat(spec.getName()).isEqualTo("researcher");
        assertThat(spec.getDescription()).isEqualTo("检索专家");
        assertThat(spec.getSystemPrompt()).isEqualTo("you are a researcher");
        assertThat(spec.getModelName()).isEqualTo("deepseek-chat");
        assertThat(spec.getToolIds()).containsExactly("web_search", "web_fetch");
        assertThat(spec.getMaxIterations()).isEqualTo(10);
    }

    @Test
    void resolveReturnsEmptyWhenNoEnabledMatch() {
        when(mapper.selectOne(any())).thenReturn(null);
        assertThat(service.resolve("ghost", TENANT)).isEmpty();
    }

    @Test
    void listAvailableMapsAllEnabledDefinitions() {
        when(mapper.selectList(any())).thenReturn(Collections.singletonList(validEntity()));
        List<CustomAgentResolver.CustomAgentSpec> specs = service.listAvailable(TENANT);
        assertThat(specs).hasSize(1);
        assertThat(specs.get(0).getName()).isEqualTo("researcher");
    }

    // ---- tool_ids JSON parsing ----

    @Test
    void parseToolIdsHandlesNullBlankAndInvalidJson() {
        assertThat(service.parseToolIds(null)).isEmpty();
        assertThat(service.parseToolIds("  ")).isEmpty();
        assertThat(service.parseToolIds("not-json")).isEmpty();
        assertThat(service.parseToolIds("[\"b\",\"a\"]")).containsExactly("b", "a");
    }
}
