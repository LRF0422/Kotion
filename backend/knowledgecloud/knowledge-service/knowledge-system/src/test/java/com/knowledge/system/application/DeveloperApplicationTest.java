package com.knowledge.system.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
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
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.context.SecurityContextHolder;

import com.baomidou.mybatisplus.extension.conditions.update.LambdaUpdateChainWrapper;
import com.knowledge.core.secure.auth.KnowledgeUserAuthentication;
import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.core.tool.exception.BusinessException;
import com.knowledge.system.domain.Developer;
import com.knowledge.system.domain.dto.DeveloperApplyDTO;
import com.knowledge.system.domain.dto.DeveloperReviewDTO;
import com.knowledge.system.domain.enums.DeveloperIdType;
import com.knowledge.system.domain.enums.DeveloperStatus;
import com.knowledge.system.domain.vo.AdminDeveloperVO;
import com.knowledge.system.domain.vo.DeveloperVO;
import com.knowledge.system.service.IDeveloperService;
import com.knowledge.system.vo.DeveloperVerificationVO;

@ExtendWith(MockitoExtension.class)
class DeveloperApplicationTest {

    private static final Long USER_ID = 42L;
    private static final Long RECORD_ID = 9L;

    @Mock
    private IDeveloperService developerService;
    @InjectMocks
    private DeveloperApplication application;

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void applyCreatesAPendingProfile() {
        authenticate(USER_ID, "user");
        when(developerService.getByUserId(USER_ID)).thenReturn(null);

        DeveloperVO result = application.apply(applyDTO("Acme Studio"));

        ArgumentCaptor<Developer> saved = ArgumentCaptor.forClass(Developer.class);
        verify(developerService).save(saved.capture());
        assertEquals(USER_ID, saved.getValue().getUserId());
        assertEquals("Acme Studio", saved.getValue().getDisplayName());
        assertEquals(DeveloperStatus.PENDING, saved.getValue().getStatus());
        assertNull(saved.getValue().getRejectReason());
        assertEquals(DeveloperStatus.PENDING, result.getStatus());
        assertNotNull(result.getIdNumberMasked());
    }

    @Test
    void applyIsRejectedWhileTheApplicationIsPending() {
        authenticate(USER_ID, "user");
        when(developerService.getByUserId(USER_ID)).thenReturn(developer(RECORD_ID, DeveloperStatus.PENDING));

        BusinessException error = assertThrows(BusinessException.class,
                () -> application.apply(applyDTO("Acme Studio")));

        assertEquals(1202, error.getCode());
        verify(developerService, never()).save(any(Developer.class));
    }

    @Test
    void applyIsRejectedWhenAlreadyVerified() {
        authenticate(USER_ID, "user");
        when(developerService.getByUserId(USER_ID)).thenReturn(developer(RECORD_ID, DeveloperStatus.APPROVED));

        BusinessException error = assertThrows(BusinessException.class,
                () -> application.apply(applyDTO("Acme Studio")));

        assertEquals(1203, error.getCode());
    }

    @Test
    void rejectedApplicationCanBeResubmitted() {
        authenticate(USER_ID, "user");
        Developer rejected = developer(RECORD_ID, DeveloperStatus.REJECTED);
        rejected.setRejectReason("资料不清晰");
        rejected.setReviewerName("reviewer");
        when(developerService.getByUserId(USER_ID)).thenReturn(rejected);
        when(developerService.updateById(any(Developer.class))).thenReturn(true);

        application.apply(applyDTO("Acme Studio 2"));

        assertEquals(DeveloperStatus.PENDING, rejected.getStatus());
        assertEquals("Acme Studio 2", rejected.getDisplayName());
        assertNull(rejected.getRejectReason());
        assertNull(rejected.getReviewerName());
        verify(developerService, never()).save(any(Developer.class));
    }

    @Test
    void approveMovesPendingToApproved() {
        authenticate(1L, "PLATFORM_OPERATOR,platform.plugins.review");
        Developer pending = developer(RECORD_ID, DeveloperStatus.PENDING);
        Developer approved = developer(RECORD_ID, DeveloperStatus.APPROVED);
        when(developerService.getById(RECORD_ID)).thenReturn(pending, approved);
        LambdaUpdateChainWrapper<Developer> update = successfulUpdate();
        when(developerService.lambdaUpdate()).thenReturn(update);

        AdminDeveloperVO result = application.approve(RECORD_ID, review(null, "资料齐全"));

        assertEquals(DeveloperStatus.APPROVED, result.getStatus());
        assertEquals("110101199001011234", result.getIdNumber());
        assertNotNull(result.getIdNumberMasked());
    }

    @Test
    void rejectRequiresAReason() {
        authenticate(1L, "PLATFORM_OPERATOR,platform.plugins.review");

        BusinessException error = assertThrows(BusinessException.class,
                () -> application.reject(RECORD_ID, review(null, null)));

        assertEquals(1205, error.getCode());
        verify(developerService, never()).lambdaUpdate();
    }

    @Test
    void rejectMovesPendingToRejected() {
        authenticate(1L, "PLATFORM_OPERATOR,platform.plugins.review");
        Developer pending = developer(RECORD_ID, DeveloperStatus.PENDING);
        Developer rejected = developer(RECORD_ID, DeveloperStatus.REJECTED);
        rejected.setRejectReason("证件照片不清晰");
        when(developerService.getById(RECORD_ID)).thenReturn(pending, rejected);
        LambdaUpdateChainWrapper<Developer> update = successfulUpdate();
        when(developerService.lambdaUpdate()).thenReturn(update);

        AdminDeveloperVO result = application.reject(RECORD_ID, review("证件照片不清晰", null));

        assertEquals(DeveloperStatus.REJECTED, result.getStatus());
        assertEquals("证件照片不清晰", result.getRejectReason());
    }

    @Test
    void revokeOnlyAppliesToAnApprovedProfile() {
        authenticate(1L, "PLATFORM_OPERATOR,platform.plugins.review");
        when(developerService.getById(RECORD_ID)).thenReturn(developer(RECORD_ID, DeveloperStatus.PENDING));

        BusinessException error = assertThrows(BusinessException.class,
                () -> application.revoke(RECORD_ID, review("违规发布", null)));

        assertEquals(1204, error.getCode());
        verify(developerService, never()).lambdaUpdate();
    }

    @Test
    void revokeMovesApprovedToSuspended() {
        authenticate(1L, "PLATFORM_OPERATOR,platform.plugins.review");
        Developer approved = developer(RECORD_ID, DeveloperStatus.APPROVED);
        Developer suspended = developer(RECORD_ID, DeveloperStatus.SUSPENDED);
        when(developerService.getById(RECORD_ID)).thenReturn(approved, suspended);
        LambdaUpdateChainWrapper<Developer> update = successfulUpdate();
        when(developerService.lambdaUpdate()).thenReturn(update);

        AdminDeveloperVO result = application.revoke(RECORD_ID, review("违规发布", null));

        assertEquals(DeveloperStatus.SUSPENDED, result.getStatus());
    }

    @Test
    void verificationReportsMissingPendingAndApproved() {
        authenticate(USER_ID, "user");
        when(developerService.getByUserId(USER_ID)).thenReturn(null);
        DeveloperVerificationVO none = application.verification();
        assertNull(none.getStatus());
        assertNull(none.getDisplayName());

        when(developerService.getByUserId(USER_ID)).thenReturn(developer(RECORD_ID, DeveloperStatus.PENDING));
        DeveloperVerificationVO pending = application.verification();
        assertEquals("PENDING", pending.getStatus());
        assertNull(pending.getDisplayName());

        when(developerService.getByUserId(USER_ID)).thenReturn(developer(RECORD_ID, DeveloperStatus.APPROVED));
        DeveloperVerificationVO approved = application.verification();
        assertEquals("APPROVED", approved.getStatus());
        assertEquals("Acme Studio", approved.getDisplayName());
    }

    // --------------------------------------------------------------- helpers

    private DeveloperApplyDTO applyDTO(String displayName) {
        DeveloperApplyDTO dto = new DeveloperApplyDTO();
        dto.setDisplayName(displayName);
        dto.setContactName("张三");
        dto.setContactEmail("dev@example.com");
        dto.setContactPhone("13800138000");
        dto.setIdType(DeveloperIdType.ID_CARD);
        dto.setIdNumber("110101199001011234");
        dto.setIntro("独立开发者");
        return dto;
    }

    private DeveloperReviewDTO review(String reason, String comment) {
        DeveloperReviewDTO dto = new DeveloperReviewDTO();
        dto.setReason(reason);
        dto.setComment(comment);
        return dto;
    }

    private Developer developer(Long id, DeveloperStatus status) {
        Developer developer = new Developer();
        developer.setId(id);
        developer.setUserId(USER_ID);
        developer.setUserName("test-user");
        developer.setDisplayName("Acme Studio");
        developer.setContactName("张三");
        developer.setContactEmail("dev@example.com");
        developer.setContactPhone("13800138000");
        developer.setIdType(DeveloperIdType.ID_CARD);
        developer.setIdNumber("110101199001011234");
        developer.setStatus(status);
        return developer;
    }

    @SuppressWarnings("unchecked")
    private LambdaUpdateChainWrapper<Developer> successfulUpdate() {
        LambdaUpdateChainWrapper<Developer> wrapper = mock(LambdaUpdateChainWrapper.class, RETURNS_SELF);
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
