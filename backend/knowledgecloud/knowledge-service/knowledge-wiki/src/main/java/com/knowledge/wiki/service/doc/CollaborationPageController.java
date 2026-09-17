package com.knowledge.wiki.service.doc;

import java.time.LocalDateTime;
import java.util.Objects;
import java.util.function.Function;

import javax.validation.Valid;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.baomidou.mybatisplus.core.plugins.IgnoreStrategy;
import com.baomidou.mybatisplus.core.plugins.InterceptorIgnoreHelper;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.api.R;
import com.knowledge.wiki.service.collab.CollabSessionService;
import com.knowledge.wiki.service.entity.CollaborationInvitation;
import com.knowledge.wiki.service.entity.dto.ApplyOpsDTO;
import com.knowledge.wiki.service.entity.dto.CreatePageCheckpointDTO;
import com.knowledge.wiki.service.entity.dto.ReconcileDTO;
import com.knowledge.wiki.service.entity.dto.RestorePageDocDTO;
import com.knowledge.wiki.service.entity.dto.SessionClaimDTO;
import com.knowledge.wiki.service.entity.enums.InvitationStatus;
import com.knowledge.wiki.service.entity.vo.ApplyOpsVO;
import com.knowledge.wiki.service.entity.vo.PageDocHistoryListVO;
import com.knowledge.wiki.service.entity.vo.PageDocHistoryVO;
import com.knowledge.wiki.service.entity.vo.PageDocVO;
import com.knowledge.wiki.service.entity.vo.PageSessionVO;
import com.knowledge.wiki.service.entity.vo.RestorePageDocVO;
import com.knowledge.wiki.service.exception.WikiException;
import com.knowledge.wiki.service.service.ICollaborationInvitationService;
import com.knowledge.wiki.service.service.IPermissionService;

import cn.hutool.core.util.StrUtil;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;

/**
 * Collaboration-invitation scoped document API.
 *
 * <p>The invited collaborator lives in a different identity context (tenant) than
 * the page owner, so the tenant-scoped wiki tables ({@code wiki_space},
 * {@code wiki_page}) cannot be read through the normal {@code /page/**} routes.
 * The invitation token is the access key: every request is resolved against the
 * invitation, verified against the current invitee, and only then delegated to
 * the document services under a tenant bypass.
 *
 * <p>This mirrors {@link PageDocController} but authorizes by invitation instead
 * of by space membership, so a guest never has to join the owner's organization
 * or see any of its other content.
 */
@RestController
@RequestMapping("/collaboration/invitation/{token}")
@Api(value = "协作邀请页面文档", tags = "协作邀请页面文档")
public class CollaborationPageController {

    private static final int RANK_READ = 1;
    private static final int RANK_WRITE = 2;
    private static final int RANK_ADMIN = 3;

    @Autowired
    private PageDocService pageDocService;

    @Autowired
    private PageOpService pageOpService;

    @Autowired
    private PageDocCommandService pageDocCommandService;

    @Autowired
    private CollabSessionService collabSessionService;

    @Autowired
    private ICollaborationInvitationService collaborationInvitationService;

    // ------------------------------------------------------------------
    // Document read / write
    // ------------------------------------------------------------------

    @GetMapping("/doc")
    @ApiOperation("按邀请令牌读取页面当前文档与 rev")
    public R<PageDocVO> readDoc(@PathVariable("token") String token) {
        return collaboration(token, IPermissionService.PERMISSION_READ,
                invitation -> R.data(pageDocService.readDoc(invitation.getPageId())));
    }

    @PostMapping("/ops")
    @ApiOperation("按邀请令牌提交 op 批次")
    public R<ApplyOpsVO> applyOps(@PathVariable("token") String token,
            @RequestBody ApplyOpsDTO request) {
        return collaboration(token, IPermissionService.PERMISSION_WRITE, invitation -> {
            requireSessionHost(invitation.getPageId(), request.getClientId());
            return R.data(pageOpService.applyOps(invitation.getPageId(), request,
                    SecurityContextUtil.getUserId()));
        });
    }

    @PostMapping("/reconcile")
    @ApiOperation("按邀请令牌以全文为准收敛页面")
    public R<ApplyOpsVO> reconcile(@PathVariable("token") String token,
            @RequestBody ReconcileDTO request) {
        return collaboration(token, IPermissionService.PERMISSION_WRITE, invitation -> {
            requireSessionHost(invitation.getPageId(), request.getClientId());
            return R.data(pageOpService.reconcile(invitation.getPageId(), request,
                    SecurityContextUtil.getUserId()));
        });
    }

    // ------------------------------------------------------------------
    // History / checkpoints / restore
    // ------------------------------------------------------------------

    @GetMapping("/history")
    @ApiOperation("按邀请令牌读取文档 rev 历史")
    public R<PageDocHistoryListVO> history(@PathVariable("token") String token,
            @RequestParam(value = "beforeRev", required = false) Long beforeRev,
            @RequestParam(value = "limit", required = false) Integer limit) {
        return collaboration(token, IPermissionService.PERMISSION_READ,
                invitation -> R.data(pageDocCommandService.listHistory(invitation.getPageId(), beforeRev, limit)));
    }

    @GetMapping("/history/{rev}/doc")
    @ApiOperation("按邀请令牌物化指定 rev 的文档")
    public R<PageDocVO> historyDoc(@PathVariable("token") String token,
            @PathVariable("rev") Long rev) {
        return collaboration(token, IPermissionService.PERMISSION_READ,
                invitation -> R.data(pageDocCommandService.materializeAtRev(invitation.getPageId(), rev)));
    }

    @PostMapping({ "/checkpoint", "/checkpoints" })
    @ApiOperation("按邀请令牌创建用户命名的文档检查点")
    public R<PageDocHistoryVO> checkpoint(@PathVariable("token") String token,
            @Valid @RequestBody CreatePageCheckpointDTO request) {
        return collaboration(token, IPermissionService.PERMISSION_WRITE, invitation -> {
            requireSessionHost(invitation.getPageId(), request.getClientId());
            return R.data(pageDocCommandService.createUserCheckpoint(invitation.getPageId(),
                    SecurityContextUtil.getUserId(), request.getLabel()));
        });
    }

    @PostMapping("/restore")
    @ApiOperation("按邀请令牌将历史 rev 前向写入为当前文档")
    public R<RestorePageDocVO> restore(@PathVariable("token") String token,
            @Valid @RequestBody RestorePageDocDTO request) {
        return collaboration(token, IPermissionService.PERMISSION_WRITE, invitation -> {
            requireSessionHost(invitation.getPageId(), request.getClientId());
            return R.data(pageDocCommandService.restore(invitation.getPageId(), request.getTargetRev(),
                    SecurityContextUtil.getUserId(), request.getLabel()));
        });
    }

    // ------------------------------------------------------------------
    // Write session lease
    // ------------------------------------------------------------------

    @PostMapping("/session/claim")
    @ApiOperation("按邀请令牌申请成为页面编辑主持人")
    public R<PageSessionVO> claimSession(@PathVariable("token") String token,
            @RequestBody SessionClaimDTO request) {
        return collaboration(token, IPermissionService.PERMISSION_WRITE, invitation -> {
            requireClientId(request.getClientId());
            CollabSessionService.SessionState state = collabSessionService.claimSession(
                    invitation.getPageId(), SecurityContextUtil.getUserId(), request.getClientId(),
                    SecurityContextUtil.getUserName());
            return R.data(toVO(state, invitation.getPageId()));
        });
    }

    @PostMapping("/session/heartbeat")
    @ApiOperation("按邀请令牌续租并拉取 rev 水位线")
    public R<PageSessionVO> heartbeat(@PathVariable("token") String token,
            @RequestBody SessionClaimDTO request) {
        return collaboration(token, IPermissionService.PERMISSION_READ, invitation -> {
            requireClientId(request.getClientId());
            CollabSessionService.SessionState state = collabSessionService.heartbeat(
                    invitation.getPageId(), SecurityContextUtil.getUserId(), request.getClientId());
            return R.data(toVO(state, invitation.getPageId()));
        });
    }

    @DeleteMapping("/session")
    @ApiOperation("按邀请令牌释放编辑会话")
    public R<Boolean> releaseSession(@PathVariable("token") String token,
            @RequestBody SessionClaimDTO request) {
        return collaboration(token, IPermissionService.PERMISSION_READ, invitation -> {
            requireClientId(request.getClientId());
            collabSessionService.releaseSession(invitation.getPageId(), request.getClientId());
            return R.data(Boolean.TRUE);
        });
    }

    // ------------------------------------------------------------------
    // Seed arbitration + collaboration room authorization
    // ------------------------------------------------------------------

    @PostMapping("/seed-claim")
    @ApiOperation("按邀请令牌申请从 DB 播种协同文档的独占权")
    public R<Boolean> claimSeedRight(@PathVariable("token") String token,
            @RequestParam("clientId") String clientId) {
        return collaboration(token, IPermissionService.PERMISSION_READ,
                invitation -> R.data(collabSessionService.claimSeedRight(invitation.getPageId(), clientId)));
    }

    @DeleteMapping("/seed-claim")
    @ApiOperation("按邀请令牌释放播种独占权")
    public R<Boolean> releaseSeedRight(@PathVariable("token") String token,
            @RequestParam("clientId") String clientId) {
        return collaboration(token, IPermissionService.PERMISSION_READ, invitation -> {
            collabSessionService.releaseSeedRight(invitation.getPageId(), clientId);
            return R.data(Boolean.TRUE);
        });
    }

    /**
     * Room-server hook: authorize joining {@code page:{pageId}} with an invitation
     * token. The room server sends the invitee's access token as Bearer auth, so
     * {@link #requireInvitation} can still bind the token to that user.
     */
    @GetMapping("/collab/authorize")
    @ApiOperation("校验邀请令牌是否有权加入页面协同房间")
    public R<Boolean> authorizeCollabRoom(@PathVariable("token") String token,
            @RequestParam(value = "pageId", required = false) Long pageId) {
        return collaboration(token, IPermissionService.PERMISSION_READ, invitation -> {
            if (pageId != null && !Objects.equals(pageId, invitation.getPageId())) {
                throw WikiException.FORBIDDEN_ACCESS.newException();
            }
            return R.data(Boolean.TRUE);
        });
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    /**
     * Resolve and authorize the invitation, then run {@code action} with the MyBatis
     * tenant filter disabled for this thread. The bypass is what lets the document
     * services reach a page in the owner's tenant; authorization happens first and
     * is scoped to the invitation's own page.
     */
    private <T> T collaboration(String token, String requiredPermission,
            Function<CollaborationInvitation, T> action) {
        InterceptorIgnoreHelper.handle(IgnoreStrategy.builder().tenantLine(true).build());
        try {
            CollaborationInvitation invitation = requireInvitation(token, requiredPermission);
            return action.apply(invitation);
        } finally {
            InterceptorIgnoreHelper.clearIgnoreStrategy();
        }
    }

    private CollaborationInvitation requireInvitation(String token, String requiredPermission) {
        CollaborationInvitation invitation = collaborationInvitationService.getByTokenForValidation(token);
        if (invitation == null) {
            throw WikiException.INVITATION_NOT_FOUND.newException();
        }
        Long userId = SecurityContextUtil.getUserId();
        if (userId == null || invitation.getInviteeId() == null
                || !Objects.equals(invitation.getInviteeId(), userId)) {
            throw WikiException.FORBIDDEN_ACCESS.newException();
        }
        if (invitation.getStatus() != InvitationStatus.ACCEPTED) {
            throw WikiException.INVALID_INVITATION_STATUS.newException();
        }
        if (invitation.getExpiresAt() != null && invitation.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw WikiException.INVITATION_EXPIRED.newException();
        }
        if (!hasPermission(invitation.getPermission(), requiredPermission)) {
            throw WikiException.FORBIDDEN_ACCESS.newException();
        }
        return invitation;
    }

    private boolean hasPermission(String granted, String required) {
        return rank(granted) >= rank(required);
    }

    private int rank(String permission) {
        if (IPermissionService.PERMISSION_ADMIN.equals(permission)) {
            return RANK_ADMIN;
        }
        if (IPermissionService.PERMISSION_WRITE.equals(permission)) {
            return RANK_WRITE;
        }
        if (IPermissionService.PERMISSION_READ.equals(permission)) {
            return RANK_READ;
        }
        return 0;
    }

    private void requireSessionHost(Long pageId, String clientId) {
        requireClientId(clientId);
        if (!collabSessionService.isSessionHost(pageId, clientId)) {
            throw WikiException.NOT_SESSION_HOST.newException();
        }
    }

    private void requireClientId(String clientId) {
        if (StrUtil.isBlank(clientId)) {
            throw WikiException.REQUIRED_PARAMETER_MISSING.newException();
        }
    }

    private PageSessionVO toVO(CollabSessionService.SessionState state, Long pageId) {
        PageSessionVO vo = new PageSessionVO();
        vo.setRole(state.getRole());
        vo.setAlive(state.isAlive());
        vo.setHostUserId(state.getHostUserId());
        vo.setHostName(state.getHostName());
        vo.setHostSelf(state.isHostSelf());
        vo.setRev(pageDocService.readRev(pageId));
        return vo;
    }
}
