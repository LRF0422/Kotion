package com.knowledge.wiki.service.entity.vo;

import lombok.Data;

/**
 * The caller's standing in a page's editing session.
 * <p>
 * Returned by both claim and heartbeat so a client only ever needs one shape to
 * reason about. Every field answers a question the client has to act on: what am
 * I allowed to do ({@code role}), does a session exist at all ({@code alive}),
 * who do I tell the user is holding the page ({@code hostName}), and has anything
 * been written to the database that I have not seen ({@code rev}).
 * </p>
 */
@Data
public class PageSessionVO {

    /** {@code HOST}, {@code COLLABORATOR} or {@code NONE}. */
    private String role;

    /**
     * False when the page has no live session. For a collaborator this is the
     * signal that the host is gone for good and editing must stop — the grace
     * period has already been absorbed by the lease TTL.
     */
    private boolean alive;

    private Long hostUserId;

    /**
     * Display name of the host. A collaborator who is about to be told it cannot
     * edit needs to know who holds the page, or being demoted looks arbitrary.
     */
    private String hostName;

    /** True when the host lease belongs to the calling user (possibly another tab). */
    private boolean hostSelf;

    /**
     * The page's current rev, used by the host as a watermark: a rev higher than
     * the one it knows about means something was written server-side and its
     * document has to catch up before it saves again.
     */
    private Long rev;

}
