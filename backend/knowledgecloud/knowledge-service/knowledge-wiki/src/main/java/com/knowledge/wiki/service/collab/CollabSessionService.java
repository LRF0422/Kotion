package com.knowledge.wiki.service.collab;

import java.time.Duration;
import java.util.Objects;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;

import cn.hutool.core.util.StrUtil;
import cn.hutool.json.JSONUtil;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;

/**
 * Server-side arbitration for the collaborative editing of a single page.
 * <p>
 * State lives in Redis rather than in a table: it is short-lived coordination
 * state, never authoritative data. The DB remains the only source of truth.
 *
 * <h3>Why seed arbitration exists</h3>
 * A brand-new page's content only lives in the DB — the collaborative Y.Doc for
 * its room starts empty. The first client to open it has to copy the REST
 * content into the Y.Doc ("seeding"). Clients used to decide this locally, by
 * checking whether their own Y.Doc was empty. That is a <em>distributed</em>
 * decision made from <em>local</em> state: two clients opening the same page at
 * the same time both observe an empty document (neither has received the
 * other's update yet), both seed, and Yjs — which merges rather than
 * de-duplicates — keeps both copies. The whole page doubles.
 * <p>
 * A single Redis {@code SETNX} removes the ambiguity: exactly one client can
 * ever hold the right to seed a given page.
 */
@Slf4j
@Component
public class CollabSessionService {

    @Autowired
    private RedisTemplate<String, String> redisTemplate;

    private static final String SEED_CLAIM_PREFIX = "wiki:page:seed:";

    /**
     * How long a seed claim is held. Seeding happens immediately after the
     * claim is granted, so this only has to outlive one round trip plus the
     * transform cost of a large document. Kept short on purpose: if the winner
     * dies before it seeds, the page stays empty until the claim expires, and a
     * reload after that can seed it.
     */
    private static final Duration SEED_CLAIM_TTL = Duration.ofSeconds(20);

    /**
     * Try to acquire the exclusive right to seed a page's collaborative
     * document from DB content.
     *
     * @param pageId   the page whose room is being seeded
     * @param clientId caller identity, stable for the lifetime of one provider.
     *                 Re-asking with the same {@code clientId} is granted again
     *                 so a retry after a dropped response is not deadlocked by
     *                 the caller's own claim.
     * @return {@code true} when the caller may seed; {@code false} when another
     *         client already holds the claim and this caller must instead wait
     *         for the content to arrive over the collaboration channel
     */
    public boolean claimSeedRight(Long pageId, String clientId) {
        if (pageId == null || StrUtil.isBlank(clientId)) {
            return false;
        }
        String key = SEED_CLAIM_PREFIX + pageId;
        Boolean acquired = redisTemplate.opsForValue().setIfAbsent(key, clientId, SEED_CLAIM_TTL);
        if (Boolean.TRUE.equals(acquired)) {
            return true;
        }
        // Re-entrant for the same client: a lost response must not lock the
        // caller out of its own claim.
        String holder = redisTemplate.opsForValue().get(key);
        if (clientId.equals(holder)) {
            redisTemplate.expire(key, SEED_CLAIM_TTL);
            return true;
        }
        log.debug("claimSeedRight: pageId={} denied for clientId={}, held by {}", pageId, clientId, holder);
        return false;
    }

    /**
     * Release a seed claim once the seed has landed (or was found unnecessary),
     * so a subsequent opener is not made to wait out the TTL. Only the holder
     * can release.
     */
    public void releaseSeedRight(Long pageId, String clientId) {
        if (pageId == null || StrUtil.isBlank(clientId)) {
            return;
        }
        String key = SEED_CLAIM_PREFIX + pageId;
        if (clientId.equals(redisTemplate.opsForValue().get(key))) {
            redisTemplate.delete(key);
        }
    }

    // ------------------------------------------------------------------
    // Editing session: exactly one interactive writer per page
    // ------------------------------------------------------------------

    /** The session host: the only client allowed to write this page to the DB. */
    public static final String ROLE_HOST = "HOST";

    /** A participant who may edit the shared document but never writes the DB. */
    public static final String ROLE_COLLABORATOR = "COLLABORATOR";

    /** No live session — the caller must claim before it can do anything. */
    public static final String ROLE_NONE = "NONE";

    private static final String SESSION_PREFIX = "wiki:page:session:";

    /**
     * How long a session survives without a heartbeat.
     * <p>
     * This doubles as the grace period: a host that reloads, changes network or
     * goes through a tunnel re-claims within the window and continues its own
     * session. Shorter and a single network hiccup kills the session, taking every
     * collaborator's editing rights with it; longer and collaborators wait too long
     * after a host really has left. The client heartbeats at a third of this.
     * </p>
     */
    private static final Duration SESSION_TTL = Duration.ofSeconds(30);

    /** Who owns the write lease on a page, and since when. */
    @Data
    public static class PageSession {

        private Long hostUserId;

        /** Identifies one provider instance, so a reload is a different client. */
        private String hostClientId;

        /** Display name, so collaborators can be told who holds the page. */
        private String hostName;

        /**
         * Whether the lease was taken through a collaboration invitation, i.e.
         * by an invited collaborator ("guest") rather than by a regular
         * participant of the page's own space.
         * <p>
         * A guest lease is a real write lease — that is what lets an invited
         * WRITE/ADMIN collaborator save while nobody on the owner's side is
         * online. What makes it different is that it is <em>preemptible</em>: the
         * page belongs to the owner's side, so a regular participant joining
         * takes the lease back and persists the document from then on.
         * </p>
         */
        private boolean guest;

        private Long startedAt;
    }

    /** Outcome of a claim or heartbeat: the caller's role plus who the host is. */
    @Data
    public static class SessionState {

        private String role;

        /** False only when there is no session at all and none was created. */
        private boolean alive;

        private Long hostUserId;

        private String hostName;

        private boolean hostSelf;
    }

    /**
     * Claim the page's write lease as a regular participant.
     * <p>
     * Convenience overload for callers whose access comes from the page's own
     * space rather than from an invitation; the lease is therefore not
     * preemptible by someone who is not already the host. See
     * {@link #claimSession(Long, Long, String, String, boolean)}.
     * </p>
     */
    public SessionState claimSession(Long pageId, Long userId, String clientId, String userName) {
        return claimSession(pageId, userId, clientId, userName, false);
    }

    /**
     * Claim the page's write lease, or find out who already holds it.
     * <p>
     * Outcomes, in priority order:
     * </p>
     * <ol>
     * <li><b>No session</b> — the caller becomes host. This is the {@code SETNX},
     * so concurrent openers cannot both win. A guest opener (an invited
     * collaborator using the invitation-scoped route) records {@code guest = true}
     * on the lease.</li>
     * <li><b>The caller already holds it</b> — renewed, still host. A lost
     * response must not lock a client out of its own lease.</li>
     * <li><b>The same user holds it from a different client</b> — taken over with
     * the caller's kind of lease. This is what makes reload, network change and
     * sleep/wake continue the session instead of ending it. The old client learns
     * it was demoted on its next heartbeat and stops writing, so there is still
     * only one writer.</li>
     * <li><b>A regular participant finds a guest lease held by someone else</b> —
     * taken over. The page belongs to the owner's side, so the moment a regular
     * participant (the inviter, or a space member) opens it, it becomes the
     * writer again even though the guest was there first. The displaced guest
     * learns it was demoted on its next heartbeat and stops writing; the edits it
     * already made live in the shared Y.Doc and are persisted by the new host.</li>
     * </ol>
     * <p>
     * Anyone else becomes a collaborator: a guest cannot displace a regular host,
     * and guests do not arbitrate among themselves. There is no election and no
     * queue: the lease is released by the host leaving, and whoever opens the
     * page next gets it.
     * </p>
     *
     * @param guest {@code true} when the caller is an invited collaborator
     *              claiming through an invitation; such a lease is preemptible
     *              by a regular participant. {@code false} marks the caller as a
     *              participant of the page's own space.
     */
    public SessionState claimSession(Long pageId, Long userId, String clientId, String userName, boolean guest) {
        if (pageId == null || userId == null || StrUtil.isBlank(clientId)) {
            return state(ROLE_NONE, false, null, null, false);
        }
        String key = SESSION_PREFIX + pageId;

        PageSession mine = new PageSession();
        mine.setHostUserId(userId);
        mine.setHostClientId(clientId);
        mine.setHostName(userName);
        mine.setGuest(guest);
        mine.setStartedAt(System.currentTimeMillis());

        Boolean acquired = redisTemplate.opsForValue()
                .setIfAbsent(key, JSONUtil.toJsonStr(mine), SESSION_TTL);
        if (Boolean.TRUE.equals(acquired)) {
            log.debug("claimSession: pageId={} granted to userId={} clientId={} guest={}",
                    pageId, userId, clientId, guest);
            return state(ROLE_HOST, true, userId, userName, true);
        }

        PageSession holder = readSession(key);
        if (holder == null) {
            // Expired between the SETNX and the read. One retry is enough: the
            // caller's next heartbeat re-claims anyway.
            return claimSession(pageId, userId, clientId, userName, guest);
        }

        if (clientId.equals(holder.getHostClientId())) {
            // Renewal keeps the recorded kind of lease: flipping it here would
            // change, mid-session, who is allowed to preempt it.
            redisTemplate.expire(key, SESSION_TTL);
            return state(ROLE_HOST, true, holder.getHostUserId(), holder.getHostName(), true);
        }

        if (Objects.equals(userId, holder.getHostUserId())) {
            // Same human, new tab or reconnect. The write is not atomic against a
            // concurrent claim, but every racer here is the same user, so any
            // winner satisfies "one writer, and it belongs to this user".
            redisTemplate.opsForValue().set(key, JSONUtil.toJsonStr(mine), SESSION_TTL);
            log.debug("claimSession: pageId={} taken over by userId={} newClientId={} guest={}",
                    pageId, userId, clientId, guest);
            return state(ROLE_HOST, true, userId, userName, true);
        }

        if (!guest && holder.isGuest()) {
            // A regular participant joins the session a guest is holding: hand
            // the write lease back to the owner's side. The guest keeps editing
            // the shared Y.Doc until its next heartbeat tells it it is no longer
            // host; whatever it wrote before that is persisted by this client.
            redisTemplate.opsForValue().set(key, JSONUtil.toJsonStr(mine), SESSION_TTL);
            log.info("claimSession: pageId={} preempted from guest userId={} by userId={}",
                    pageId, holder.getHostUserId(), userId);
            return state(ROLE_HOST, true, userId, userName, true);
        }

        return state(ROLE_COLLABORATOR, true, holder.getHostUserId(), holder.getHostName(), false);
    }

    /**
     * Renew the lease if the caller holds it, and report the current role either
     * way.
     * <p>
     * A host learns here that it was demoted; a collaborator learns here that the
     * session ended ({@code alive == false}), which is its cue to go read-only.
     * Renewal is deliberately the host's job only — a collaborator's heartbeat must
     * never keep an absent host's lease alive.
     * </p>
     */
    public SessionState heartbeat(Long pageId, Long userId, String clientId) {
        if (pageId == null || userId == null || StrUtil.isBlank(clientId)) {
            return state(ROLE_NONE, false, null, null, false);
        }
        String key = SESSION_PREFIX + pageId;
        PageSession holder = readSession(key);
        if (holder == null) {
            return state(ROLE_NONE, false, null, null, false);
        }
        if (clientId.equals(holder.getHostClientId())) {
            redisTemplate.expire(key, SESSION_TTL);
            return state(ROLE_HOST, true, holder.getHostUserId(), holder.getHostName(), true);
        }
        return state(ROLE_COLLABORATOR, true, holder.getHostUserId(), holder.getHostName(),
                Objects.equals(userId, holder.getHostUserId()));
    }

    /**
     * Give up the lease on an orderly close, so the next opener does not have to
     * wait out the TTL. Only the holder can release; a collaborator closing its tab
     * must not end everyone's session.
     */
    public void releaseSession(Long pageId, String clientId) {
        if (pageId == null || StrUtil.isBlank(clientId)) {
            return;
        }
        String key = SESSION_PREFIX + pageId;
        PageSession holder = readSession(key);
        if (holder != null && clientId.equals(holder.getHostClientId())) {
            redisTemplate.delete(key);
            log.debug("releaseSession: pageId={} released by clientId={}", pageId, clientId);
        }
    }

    /**
     * Whether this exact client currently holds the page's write lease.
     * <p>
     * This is the write path's primary gate. It is intentionally strict about
     * {@code clientId} and not merely about the user: two tabs of one user are two
     * independent documents, and letting both write would reintroduce exactly the
     * concurrent-writer problem the session exists to remove.
     * </p>
     */
    public boolean isSessionHost(Long pageId, String clientId) {
        if (pageId == null || StrUtil.isBlank(clientId)) {
            return false;
        }
        PageSession holder = readSession(SESSION_PREFIX + pageId);
        return holder != null && clientId.equals(holder.getHostClientId());
    }

    /** The live session, or null when the page has none. */
    public PageSession getSession(Long pageId) {
        return pageId == null ? null : readSession(SESSION_PREFIX + pageId);
    }

    private PageSession readSession(String key) {
        String raw = redisTemplate.opsForValue().get(key);
        if (StrUtil.isBlank(raw)) {
            return null;
        }
        try {
            return JSONUtil.toBean(raw, PageSession.class);
        } catch (Exception e) {
            // Unreadable coordination state is not worth failing a request over:
            // drop it and let the next claim rebuild it.
            log.warn("readSession: discarding unparseable session at {}: {}", key, e.getMessage());
            redisTemplate.delete(key);
            return null;
        }
    }

    private static SessionState state(String role, boolean alive, Long hostUserId, String hostName,
            boolean hostSelf) {
        SessionState s = new SessionState();
        s.setRole(role);
        s.setAlive(alive);
        s.setHostUserId(hostUserId);
        s.setHostName(hostName);
        s.setHostSelf(hostSelf);
        return s;
    }
}
