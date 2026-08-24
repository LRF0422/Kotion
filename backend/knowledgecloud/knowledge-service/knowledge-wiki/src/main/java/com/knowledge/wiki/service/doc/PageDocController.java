package com.knowledge.wiki.service.doc;

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

import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.api.R;
import com.knowledge.wiki.service.collab.CollabSessionService;
import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.dto.ApplyOpsDTO;
import com.knowledge.wiki.service.entity.dto.CreatePageCheckpointDTO;
import com.knowledge.wiki.service.entity.dto.ReconcileDTO;
import com.knowledge.wiki.service.entity.dto.RestorePageDocDTO;
import com.knowledge.wiki.service.entity.dto.SessionClaimDTO;
import com.knowledge.wiki.service.entity.vo.ApplyOpsVO;
import com.knowledge.wiki.service.entity.vo.PageDocHistoryListVO;
import com.knowledge.wiki.service.entity.vo.PageDocHistoryVO;
import com.knowledge.wiki.service.entity.vo.PageDocVO;
import com.knowledge.wiki.service.entity.vo.PageSessionVO;
import com.knowledge.wiki.service.entity.vo.RestorePageDocVO;
import com.knowledge.wiki.service.exception.WikiException;
import com.knowledge.wiki.service.service.IPageService;
import com.knowledge.wiki.service.service.IPermissionService;

import cn.hutool.core.util.StrUtil;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;

/**
 * The document read/write API of the block-authoritative save path.
 * <p>
 * Deliberately a separate controller from {@code SpaceController} rather than
 * more endpoints on it: the old block endpoints there are on the removal list,
 * and keeping the two paths in different files means retiring the old one is a
 * deletion instead of a careful extraction.
 * </p>
 * <p>
 * <b>This is the editor's save path.</b> {@code GET /doc} is what the editor
 * loads from and what the session host re-reads to fold in a write it did not
 * make; {@code /ops} and {@code /reconcile} are the only ways a browser changes a
 * page. The old block endpoints on {@code SpaceController} are on the removal
 * list and no longer serve the main editor.
 * </p>
 * <p>
 * <b>This controller is the browser-facing boundary, and it is where the session
 * host check lives.</b> Server-side writers (AI, import, scheduled jobs) call
 * {@link PageOpService} directly: they hold no lease, and requiring one would
 * make document writing impossible without a live browser tab — the exact
 * limitation this rewrite removes.
 * </p>
 */
@RestController
@RequestMapping("/page")
@Api(value = "页面文档", tags = "页面文档（块权威存储）")
public class PageDocController {

    @Autowired
    private PageDocService pageDocService;

    @Autowired
    private PageOpService pageOpService;

    @Autowired
    private PageDocCommandService pageDocCommandService;

    @Autowired
    private IPageService pageService;

    @Autowired
    private IPermissionService permissionService;

    @Autowired
    private CollabSessionService collabSessionService;

    @GetMapping("/{pageId}/doc")
    @ApiOperation("读取页面当前文档与 rev")
    public R<PageDocVO> readDoc(@PathVariable("pageId") Long pageId) {
        checkPage(pageId, IPermissionService.PERMISSION_READ);
        return R.data(pageDocService.readDoc(pageId));
    }

    @PostMapping({ "/{pageId}/checkpoint", "/{pageId}/checkpoints" })
    @ApiOperation("创建用户命名的文档检查点")
    public R<PageDocHistoryVO> checkpoint(@PathVariable("pageId") Long pageId,
            @Valid @RequestBody CreatePageCheckpointDTO request) {
        checkPage(pageId, IPermissionService.PERMISSION_WRITE);
        requireSessionHost(pageId, request.getClientId());
        return R.data(pageDocCommandService.createUserCheckpoint(pageId, SecurityContextUtil.getUserId(),
                request.getLabel()));
    }

    @GetMapping("/{pageId}/history")
    @ApiOperation("读取文档 rev 历史")
    public R<PageDocHistoryListVO> history(@PathVariable("pageId") Long pageId,
            @RequestParam(value = "beforeRev", required = false) Long beforeRev,
            @RequestParam(value = "limit", required = false) Integer limit) {
        checkPage(pageId, IPermissionService.PERMISSION_READ);
        return R.data(pageDocCommandService.listHistory(pageId, beforeRev, limit));
    }

    @GetMapping({ "/{pageId}/history/{rev}/doc", "/{pageId}/history-doc/{rev}" })
    @ApiOperation("物化指定 rev 的文档")
    public R<PageDocVO> historyDoc(@PathVariable("pageId") Long pageId, @PathVariable("rev") Long rev) {
        checkPage(pageId, IPermissionService.PERMISSION_READ);
        return R.data(pageDocCommandService.materializeAtRev(pageId, rev));
    }

    @PostMapping("/{pageId}/restore")
    @ApiOperation("将历史 rev 以前向写入方式恢复为当前文档")
    public R<RestorePageDocVO> restore(@PathVariable("pageId") Long pageId,
            @Valid @RequestBody RestorePageDocDTO request) {
        checkPage(pageId, IPermissionService.PERMISSION_WRITE);
        requireSessionHost(pageId, request.getClientId());
        return R.data(pageDocCommandService.restore(pageId, request.getTargetRev(), SecurityContextUtil.getUserId(),
                request.getLabel()));
    }

    /**
     * Apply a batch of ops.
     * <p>
     * The host check is the primary concurrency control; the page row lock inside
     * the service is the backstop underneath it. With the host check in place,
     * conflicting writes between browser clients essentially stop happening, but the
     * lock stays because correctness should not depend on Redis being reachable.
     * </p>
     */
    @PostMapping("/{pageId}/ops")
    @ApiOperation("提交 op 批次")
    public R<ApplyOpsVO> applyOps(@PathVariable("pageId") Long pageId, @RequestBody ApplyOpsDTO request) {
        checkPage(pageId, IPermissionService.PERMISSION_WRITE);
        requireSessionHost(pageId, request.getClientId());
        return R.data(pageOpService.applyOps(pageId, request, SecurityContextUtil.getUserId()));
    }

    @PostMapping("/{pageId}/reconcile")
    @ApiOperation("以全文为准收敛页面（服务端自行 diff 出 op）")
    public R<ApplyOpsVO> reconcile(@PathVariable("pageId") Long pageId, @RequestBody ReconcileDTO request) {
        checkPage(pageId, IPermissionService.PERMISSION_WRITE);
        requireSessionHost(pageId, request.getClientId());
        return R.data(pageOpService.reconcile(pageId, request, SecurityContextUtil.getUserId()));
    }

    // ------------------------------------------------------------------
    // Session
    // ------------------------------------------------------------------

    /**
     * Take the page's write lease, or learn who holds it.
     * <p>
     * Gated on WRITE: a reader has no use for a lease it could never exercise, and
     * handing one out would let a read-only visitor block the people who can
     * actually edit.
     * </p>
     */
    @PostMapping("/{pageId}/session/claim")
    @ApiOperation("申请成为页面编辑主持人")
    public R<PageSessionVO> claimSession(@PathVariable("pageId") Long pageId,
            @RequestBody SessionClaimDTO request) {
        checkPage(pageId, IPermissionService.PERMISSION_WRITE);
        requireClientId(request.getClientId());
        CollabSessionService.SessionState state = collabSessionService.claimSession(pageId,
                SecurityContextUtil.getUserId(), request.getClientId(), SecurityContextUtil.getUserName());
        return R.data(toVO(state, pageId));
    }

    /**
     * Renew the lease and pick up the rev watermark.
     * <p>
     * The heartbeat carries {@code rev} because it is already a periodic round trip
     * the host makes anyway: reusing it as the watermark channel means a server-side
     * write becomes visible to the host within one heartbeat without adding a
     * transport. A collaborator uses the same call to find out the session ended.
     * </p>
     */
    @PostMapping("/{pageId}/session/heartbeat")
    @ApiOperation("会话心跳，同时拉取 rev 水位线")
    public R<PageSessionVO> heartbeat(@PathVariable("pageId") Long pageId,
            @RequestBody SessionClaimDTO request) {
        checkPage(pageId, IPermissionService.PERMISSION_READ);
        requireClientId(request.getClientId());
        CollabSessionService.SessionState state = collabSessionService.heartbeat(pageId,
                SecurityContextUtil.getUserId(), request.getClientId());
        return R.data(toVO(state, pageId));
    }

    /**
     * Release the lease on an orderly close so the next opener does not wait out
     * the TTL. Ignoring a non-holder is deliberate, not lax: a collaborator closing
     * its tab must not end the session for everyone.
     */
    @DeleteMapping("/{pageId}/session")
    @ApiOperation("释放编辑会话（房主正常关页）")
    public R<Boolean> releaseSession(@PathVariable("pageId") Long pageId,
            @RequestBody SessionClaimDTO request) {
        checkPage(pageId, IPermissionService.PERMISSION_READ);
        requireClientId(request.getClientId());
        collabSessionService.releaseSession(pageId, request.getClientId());
        return R.data(Boolean.TRUE);
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

    private void requireClientId(String clientId) {
        if (StrUtil.isBlank(clientId)) {
            throw WikiException.REQUIRED_PARAMETER_MISSING.newException();
        }
    }

    /**
     * Reject any interactive write that does not come from the lease holder.
     * <p>
     * A missing {@code clientId} is refused rather than waved through. Treating it
     * as "probably a server-side writer" would turn the whole session model into an
     * opt-in suggestion that any client could skip by omitting a field.
     * </p>
     */
    private void requireSessionHost(Long pageId, String clientId) {
        requireClientId(clientId);
        if (!collabSessionService.isSessionHost(pageId, clientId)) {
            throw WikiException.NOT_SESSION_HOST.newException();
        }
    }

    private void checkPage(Long pageId, String permission) {
        if (pageId == null) {
            throw WikiException.INVALID_PARAMETER.newException();
        }
        Page page = pageService.getById(pageId);
        if (page == null) {
            throw WikiException.PAGE_NOT_FOUND.newException();
        }
        permissionService.checkPagePermission(SecurityContextUtil.getUserId(), page, permission);
    }

}
