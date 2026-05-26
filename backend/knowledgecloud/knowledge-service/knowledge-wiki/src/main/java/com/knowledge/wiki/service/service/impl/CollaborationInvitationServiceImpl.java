package com.knowledge.wiki.service.service.impl;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

import com.github.yulichang.base.MPJBaseServiceImpl;
import com.knowledge.wiki.service.entity.CollaborationInvitation;
import com.knowledge.wiki.service.entity.enums.InvitationStatus;
import com.knowledge.wiki.service.mapper.CollaborationInvitationMapper;
import com.knowledge.wiki.service.service.ICollaborationInvitationService;

import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.collection.ListUtil;
import cn.hutool.core.util.IdUtil;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class CollaborationInvitationServiceImpl
        extends MPJBaseServiceImpl<CollaborationInvitationMapper, CollaborationInvitation>
        implements ICollaborationInvitationService {

    @Override
    public void accept(Long id) {
        this.lambdaUpdate()
                .eq(CollaborationInvitation::getId, id)
                .set(CollaborationInvitation::getStatus, InvitationStatus.ACCEPTED)
                .set(CollaborationInvitation::getUpdatedAt, LocalDateTime.now())
                .update();
    }

    @Override
    public void reject(Long id) {
        this.lambdaUpdate()
                .eq(CollaborationInvitation::getId, id)
                .set(CollaborationInvitation::getStatus, InvitationStatus.REJECTED)
                .set(CollaborationInvitation::getUpdatedAt, LocalDateTime.now())
                .update();
    }

    @Override
    public List<CollaborationInvitation> create(List<CollaborationInvitation> invitations) {
        if (CollUtil.isEmpty(invitations)) {
            return ListUtil.empty();
        }
        log.debug("Creating {} collaboration invitations", invitations.size());
        LocalDateTime now = LocalDateTime.now();
        List<CollaborationInvitation> toCreate = invitations.stream()
                .filter(it -> !exists(it))
                .peek(it -> {
                    it.setCreatedAt(now);
                    it.setUpdatedAt(now);
                    if (it.getStatus() == null) {
                        it.setStatus(InvitationStatus.PENDING);
                    }
                    // Generate unique token for invitation link
                    if (it.getToken() == null) {
                        it.setToken(IdUtil.fastSimpleUUID());
                    }
                })
                .collect(Collectors.toList());
        this.saveBatch(toCreate);
        log.info("Created {} collaboration invitations successfully", toCreate.size());
        return toCreate;
    }

    @Override
    public List<CollaborationInvitation> getByInvitee(Long inviteeId) {
        return this.lambdaQuery()
                .eq(CollaborationInvitation::getInviteeId, inviteeId)
                .eq(CollaborationInvitation::getStatus, InvitationStatus.PENDING)
                .list();
    }

    @Override
    public List<CollaborationInvitation> getByPage(Long pageId) {
        return this.lambdaQuery()
                .eq(CollaborationInvitation::getPageId, pageId)
                .list();
    }

    @Override
    public CollaborationInvitation getByToken(String token) {
        return this.lambdaQuery()
                .eq(CollaborationInvitation::getToken, token)
                // .eq(CollaborationInvitation::getStatus, InvitationStatus.PENDING)
                .one();
    }

    @Override
    public CollaborationInvitation getByTokenForValidation(String token) {
        return this.lambdaQuery()
                .eq(CollaborationInvitation::getToken, token)
                .one();
    }

    private boolean exists(CollaborationInvitation invitation) {
        return this.lambdaQuery()
                .eq(CollaborationInvitation::getInviteeId, invitation.getInviteeId())
                .eq(CollaborationInvitation::getPageId, invitation.getPageId())
                .eq(CollaborationInvitation::getStatus, InvitationStatus.PENDING)
                .exists();
    }

}
