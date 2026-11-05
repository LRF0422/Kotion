package com.knowledge.wiki.service.entity.vo;

import java.time.LocalDateTime;

import lombok.Data;

/**
 * One collaboration invitation of the calling user, as shown in the invitee's
 * home list.
 * <p>
 * The list answers "which pages can I get into without being a normal member of
 * their space": pending invitations to accept and already accepted ones that are
 * still usable. Every field is there so the list can render a row and link to
 * the page without a follow-up request, which is why the page/space/inviter
 * names are resolved server-side.
 * </p>
 */
@Data
public class MyCollaborationInvitationVO {

    private Long id;

    /** Access key carried by the invitation-scoped document routes. */
    private String token;

    private Long pageId;

    private Long spaceId;

    private String pageTitle;

    private String pageType;

    private String spaceName;

    private Long inviterId;

    /**
     * Display name of the inviter. Best-effort: when knowledge-system cannot be
     * reached the row is still returned, just without the name.
     */
    private String inviterName;

    /** {@code READ}, {@code WRITE} or {@code ADMIN}. */
    private String permission;

    /** {@code PENDING} (accept first) or {@code ACCEPTED} (already openable). */
    private String status;

    private LocalDateTime createdAt;

    private LocalDateTime expiresAt;
}
