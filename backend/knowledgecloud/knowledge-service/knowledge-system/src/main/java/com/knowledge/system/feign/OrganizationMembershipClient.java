package com.knowledge.system.feign;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.knowledge.core.log.exception.ServiceException;
import com.knowledge.core.tool.api.R;
import com.knowledge.system.application.OrganizationApplication;

import lombok.AllArgsConstructor;

/**
 * Internal service-to-service API used by knowledge-wiki to admit a page
 * collaboration invitee into the context that owns the shared space.
 */
@RestController
@AllArgsConstructor
@RequestMapping("/organization-membership/internal")
@PreAuthorize("hasRole('service') and principal.account == 'internal-service' and principal.userId.toString() == '-1'")
public class OrganizationMembershipClient {

    private final OrganizationApplication organizationApplication;

    @PostMapping("/ensure-member")
    public R<Boolean> ensureMember(@RequestParam("userId") Long userId,
            @RequestParam("contextId") String contextId) {
        try {
            return R.data(organizationApplication.ensureCollaborationMembership(userId, contextId));
        } catch (ServiceException rejection) {
            // Answer inside the R envelope: a bare HTTP 4xx would be turned into a
            // FeignException by the caller and the reason would be lost, leaving the
            // invited user with an unexplained failure.
            return R.fail(rejection.getMessage());
        }
    }
}
