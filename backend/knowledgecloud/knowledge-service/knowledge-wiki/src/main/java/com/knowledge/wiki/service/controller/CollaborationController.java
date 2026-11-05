package com.knowledge.wiki.service.controller;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.knowledge.core.tool.api.R;
import com.knowledge.wiki.service.application.CollaborationApplication;
import com.knowledge.wiki.service.entity.dto.InvitationAcceptResponseDTO;
import com.knowledge.wiki.service.entity.dto.InvitationEnterResponseDTO;
import com.knowledge.wiki.service.entity.dto.InvitationValidateResponseDTO;
import com.knowledge.wiki.service.entity.vo.MyCollaborationInvitationVO;
import com.knowledge.wiki.service.entity.vo.PageVO;
import com.knowledge.wiki.service.entity.vo.PluginVersionVO;

/**
 * Collaboration Invitation Controller
 * Handles invitation acceptance flow APIs
 */
@RestController
@RequestMapping("/collaboration")
public class CollaborationController {

    @Autowired
    private CollaborationApplication collaborationApplication;

    /**
     * Validate Invitation Token
     * GET /knowledge-wiki/collaboration/invitation/:token/validate
     */
    @GetMapping("/invitation/{token}/validate")
    public R<InvitationValidateResponseDTO> validateInvitation(@PathVariable("token") String token) {
        return R.data(collaborationApplication.validateInvitation(token));
    }

    /**
     * Accept Invitation
     * POST /knowledge-wiki/collaboration/invitation/:token/accept
     */
    @PostMapping("/invitation/{token}/accept")
    public R<InvitationAcceptResponseDTO> acceptInvitation(@PathVariable("token") String token) {
        return R.data(collaborationApplication.acceptInvitation(token));
    }

    /**
     * Enter an accepted invitation
     * POST /knowledge-wiki/collaboration/invitation/:token/enter
     *
     * <p>Idempotently grants the invitee membership in the context that owns the
     * shared space and returns the ids the client needs before navigating.
     */
    @PostMapping("/invitation/{token}/enter")
    public R<InvitationEnterResponseDTO> enterInvitation(@PathVariable("token") String token) {
        return R.data(collaborationApplication.enterInvitation(token));
    }

    /**
     * Get Invitation Page Content
     * GET /knowledge-wiki/collaboration/invitation/:token/page
     */
    @GetMapping("/invitation/{token}/page")
    public R<PageVO> getInvitationPage(@PathVariable("token") String token) {
        return R.data(collaborationApplication.getInvitationPage(token));
    }

    /**
     * Get Invitation Plugins
     * GET /knowledge-wiki/collaboration/invitation/:token/plugins
     * Returns the list of installed plugins for the collaboration editor
     */
    @GetMapping("/invitation/{token}/plugins")
    public R<List<PluginVersionVO>> getInvitationPlugins(@PathVariable("token") String token) {
        return R.data(collaborationApplication.getInvitationPlugins(token));
    }

    /**
     * The calling user's active collaboration invitations, for the home page.
     * GET /knowledge-wiki/collaboration/invitations/mine
     *
     * <p>Pending invitations to accept and accepted ones that are still usable;
     * one row per page, newest first.
     */
    @GetMapping("/invitations/mine")
    public R<List<MyCollaborationInvitationVO>> listMyInvitations() {
        return R.data(collaborationApplication.listMyInvitations());
    }

}
