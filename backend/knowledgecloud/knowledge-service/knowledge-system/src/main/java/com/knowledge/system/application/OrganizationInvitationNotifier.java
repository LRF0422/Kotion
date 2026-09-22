package com.knowledge.system.application;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.knowledge.core.message.feign.IMessageClient;

import cn.hutool.core.util.StrUtil;
import lombok.extern.slf4j.Slf4j;

/**
 * Best-effort in-app notification sent to the invited account when an
 * organization invitation is created.
 *
 * <p>The inviter previously had to copy the invitation link out of the settings
 * dialog and hand it to the invitee; the invitee's message box stayed empty.
 * This drops the invitation into the same persisted instant-message channel the
 * wiki collaboration invites use, so the invitee sees an actionable entry in
 * their inbox (delivered live over WebSocket, or as an offline message the next
 * time they connect).</p>
 *
 * <p>Delivery never fails the invite: a message-service error is logged and
 * swallowed, and the raw token is still returned to the inviter as a fallback.</p>
 */
@Component
@Slf4j
public class OrganizationInvitationNotifier {

    /** Instant-message content type; mirrors the wiki collaboration invite. */
    static final String MESSAGE_CONTENT_TYPE = "INVITATION";

    /** Value stored in extraData so the client can distinguish invite kinds. */
    static final String INVITATION_TYPE = "ORGANIZATION_INVITATION";

    /** In-app path the invitee taps to accept; keep in sync with the web route. */
    static final String INVITE_URL_PREFIX = "/organization-invite/";

    @Autowired(required = false)
    private IMessageClient messageClient;

    /**
     * Notify the invited account that it has a pending organization invitation.
     *
     * @param inviterId        user who created the invitation
     * @param inviterName      display name of the inviter
     * @param inviteeId        user being invited
     * @param contextId        organization (tenant) id the invitee is joining
     * @param organizationName display name of the organization
     * @param role             organization role offered by the invitation
     * @param rawToken         one-time invitation token (raw, pre-hash)
     * @param expiresAt        invitation expiry
     */
    public void notifyInvited(Long inviterId, String inviterName, Long inviteeId, String contextId,
            String organizationName, String role, String rawToken, LocalDateTime expiresAt) {
        if (messageClient == null || inviteeId == null || inviteeId <= 0
                || inviteeId.equals(inviterId) || StrUtil.isBlank(rawToken)) {
            return;
        }
        String organizationLabel = StrUtil.blankToDefault(organizationName, contextId);
        String inviterLabel = StrUtil.blankToDefault(inviterName, "组织管理员");
        String url = INVITE_URL_PREFIX + rawToken;

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("type", INVITATION_TYPE);
        data.put("contextId", contextId);
        data.put("organizationName", organizationLabel);
        data.put("inviterId", inviterId);
        data.put("inviterName", inviterLabel);
        data.put("role", role);
        data.put("token", rawToken);
        data.put("url", url);
        data.put("expiresAt", expiresAt == null ? null : expiresAt.toString());

        String message = inviterLabel + "邀请你加入组织「" + organizationLabel + "」，url:" + url;
        try {
            messageClient.sendInstantMessage(inviterId, inviteeId, message, MESSAGE_CONTENT_TYPE, data);
        } catch (Exception ex) {
            log.warn("Failed to notify user {} about organization {} invitation", inviteeId, contextId, ex);
        }
    }
}
