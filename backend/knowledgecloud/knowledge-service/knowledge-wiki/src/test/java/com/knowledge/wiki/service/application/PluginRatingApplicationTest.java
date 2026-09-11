package com.knowledge.wiki.service.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Answers.RETURNS_SELF;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.context.SecurityContextHolder;

import com.baomidou.mybatisplus.extension.conditions.query.LambdaQueryChainWrapper;
import com.baomidou.mybatisplus.extension.conditions.update.LambdaUpdateChainWrapper;
import com.knowledge.core.secure.auth.KnowledgeUserAuthentication;
import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.core.tool.exception.BusinessException;
import com.knowledge.wiki.service.entity.Plugin;
import com.knowledge.wiki.service.entity.PluginRating;
import com.knowledge.wiki.service.entity.dto.PluginRatingDTO;
import com.knowledge.wiki.service.entity.enums.PluginStatus;
import com.knowledge.wiki.service.entity.vo.PluginRatingSummaryVO;
import com.knowledge.wiki.service.service.IPluginRatingService;
import com.knowledge.wiki.service.service.IPluginService;

@ExtendWith(MockitoExtension.class)
class PluginRatingApplicationTest {

    @Mock
    private IPluginRatingService pluginRatingService;
    @Mock
    private IPluginService pluginService;
    @InjectMocks
    private PluginRatingApplication application;

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void updateExistingRatingRecomputesAggregate() {
        authenticate(42L, "user");
        Plugin plugin = plugin(7L, 99L);

        PluginRating existing = new PluginRating();
        existing.setId(1L);
        existing.setPluginId(7L);
        existing.setUserId(42L);
        existing.setScore(4);

        LambdaQueryChainWrapper<PluginRating> query = queryReturning(existing);
        LambdaUpdateChainWrapper<Plugin> update = successfulPluginUpdate();

        when(pluginService.getById(7L)).thenReturn(plugin);
        when(pluginRatingService.lambdaQuery()).thenReturn(query);
        when(pluginRatingService.countByPlugin(7L)).thenReturn(1L);
        when(pluginRatingService.averageScore(7L)).thenReturn(5.0D);
        when(pluginService.lambdaUpdate()).thenReturn(update);

        PluginRatingSummaryVO result = application.rate(7L, rating(5));

        assertEquals(5, existing.getScore());
        assertEquals(5.0D, result.getRating());
        assertEquals(1L, result.getReviews());
        assertEquals(5, result.getMyScore());
        verify(pluginRatingService).updateById(existing);
    }

    @Test
    void developerCannotRateOwnPlugin() {
        authenticate(42L, "user");
        when(pluginService.getById(7L)).thenReturn(plugin(7L, 42L));

        assertThrows(BusinessException.class, () -> application.rate(7L, rating(5)));
        verify(pluginRatingService, never()).save(any(PluginRating.class));
    }

    private Plugin plugin(Long id, Long developerId) {
        Plugin plugin = new Plugin();
        plugin.setId(id);
        plugin.setStatus(PluginStatus.DONE);
        plugin.setDeveloperId(developerId);
        return plugin;
    }

    private PluginRatingDTO rating(int score) {
        PluginRatingDTO dto = new PluginRatingDTO();
        dto.setScore(score);
        return dto;
    }

    @SuppressWarnings("unchecked")
    private LambdaQueryChainWrapper<PluginRating> queryReturning(PluginRating entity) {
        LambdaQueryChainWrapper<PluginRating> query = mock(LambdaQueryChainWrapper.class, RETURNS_SELF);
        when(query.one()).thenReturn(entity);
        return query;
    }

    @SuppressWarnings("unchecked")
    private LambdaUpdateChainWrapper<Plugin> successfulPluginUpdate() {
        LambdaUpdateChainWrapper<Plugin> wrapper = mock(LambdaUpdateChainWrapper.class, RETURNS_SELF);
        when(wrapper.update()).thenReturn(true);
        return wrapper;
    }

    private void authenticate(Long userId, String role) {
        KnowledgeUser user = new KnowledgeUser();
        user.setUserId(userId);
        user.setUserName("test-user");
        user.setRoleName(role);
        SecurityContextHolder.getContext().setAuthentication(new KnowledgeUserAuthentication(user, "token"));
    }
}
