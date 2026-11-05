package com.knowledge.wiki.service.service;

import java.util.Set;

import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.Space;

/**
 * Unified permission resolution service.
 * Effective page permission = max(space-role implied permission, page-level
 * collaborator grant). Page permission values follow the existing string
 * enum: READ / WRITE / ADMIN.
 */
public interface IPermissionService {

    String PERMISSION_READ = "READ";
    String PERMISSION_WRITE = "WRITE";
    String PERMISSION_ADMIN = "ADMIN";

    /**
     * Resolve the effective permission of a user on a page.
     *
     * @return READ / WRITE / ADMIN, or null when the user has no access
     */
    String effectivePagePermission(Long userId, Long pageId);

    /**
     * Same as {@link #effectivePagePermission(Long, Long)} but avoids
     * re-fetching an already loaded page.
     */
    String effectivePagePermission(Long userId, Page page);

    /**
     * Space-wide implied page permission from the user's space role and the
     * space visibility. Returns null when the user has no space-wide access
     * (e.g. GUEST members or non-members of a private space).
     */
    String effectiveSpacePermission(Long userId, Space space);

    /**
     * Assert the user holds at least the required permission on the page,
     * otherwise throws FORBIDDEN_ACCESS.
     */
    void checkPagePermission(Long userId, Page page, String requiredPermission);

    /**
     * Page ids in the given space that the user has explicit page-level
     * collaborator grants on. Used to filter the page tree for GUEST users.
     */
    Set<Long> getGrantedPageIds(Long userId, Long spaceId);

    /**
     * Whether the user holds an explicit page-level collaborator grant on this
     * page — i.e. was added as an invited collaborator rather than getting
     * access through their own space role.
     * <p>
     * The grant is materialized when a collaboration invitation is accepted and
     * outlives the invitation row (acceptance is permanent; expiry only closes
     * the token route). It is therefore the stable provenance that write-lease
     * arbitration needs: a page-level collaborator is a guest whose lease the
     * page's own side may always take back, however that collaborator reached
     * the page and whatever became of the invitation token.
     * </p>
     */
    boolean hasPageGrant(Long userId, Long pageId);
}
