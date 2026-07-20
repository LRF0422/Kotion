package com.knowledge.wiki.service.application;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.github.yulichang.toolkit.MPJWrappers;
import com.github.yulichang.wrapper.MPJLambdaWrapper;
import com.knowledge.core.common.base.Icon;
import com.knowledge.core.common.base.IconType;
import com.knowledge.core.message.feign.IMessageClient;
import com.knowledge.core.secure.utils.SecurityContextUtil;
import com.knowledge.core.tool.KnowledgeUser;
import com.knowledge.core.tool.utils.ApiClientUtil;
import com.knowledge.core.version.VersionStatus;
import com.knowledge.system.feign.IUserClient;
import com.knowledge.wiki.service.converter.FavoriteItemConverter;
import com.knowledge.wiki.service.converter.PageConverter;
import com.knowledge.wiki.service.converter.SpaceConverter;
import com.knowledge.wiki.service.converter.BlockVersionConverter;
import com.knowledge.wiki.service.entity.CollaborationInvitation;
import com.knowledge.wiki.service.entity.FavoriteItem;
import com.knowledge.wiki.service.entity.Page;
import com.knowledge.wiki.service.entity.dto.UpdateBlockDTO;
import com.knowledge.wiki.service.entity.vo.PageBlockDetailVO;
import com.knowledge.wiki.service.entity.PageVersion;
import com.knowledge.wiki.service.entity.Space;
import com.knowledge.wiki.service.entity.dto.PageDTO;
import com.knowledge.wiki.service.entity.dto.QueryFavoriteDTO;
import com.knowledge.wiki.service.entity.dto.QueryPageBlockDTO;
import com.knowledge.wiki.service.entity.dto.QueryPageDTO;
import com.knowledge.wiki.service.entity.dto.QueryPageTemplateDTO;
import com.knowledge.wiki.service.entity.dto.QuerySpaceDTO;
import com.knowledge.wiki.service.entity.dto.SaveTemplateDTO;
import com.knowledge.wiki.service.entity.dto.SpaceDTO;
import com.knowledge.wiki.service.entity.dto.TemplateDTO;
import com.knowledge.wiki.service.entity.dto.CollaborationInvitationRequestDTO;
import com.knowledge.wiki.service.entity.dto.CollaborationInvitationResponseDTO;
import com.knowledge.wiki.service.entity.dto.PatchResultDTO;
import com.knowledge.wiki.service.entity.dto.PageCollaboratorDTO;
import com.knowledge.wiki.service.entity.dto.ShareLinkRequestDTO;
import com.knowledge.wiki.service.entity.dto.ShareLinkResponseDTO;
import com.knowledge.wiki.service.entity.dto.SpaceMemberDTO;
import com.knowledge.wiki.service.entity.enums.SpaceType;
import com.knowledge.wiki.service.entity.enums.SpacePermissionEnum;
import com.knowledge.wiki.service.entity.enums.PageStatus;
import com.knowledge.wiki.service.entity.vo.InvitedPageVO;
import com.knowledge.wiki.service.entity.vo.PageBlockVO;
import com.knowledge.wiki.service.entity.vo.PageContentVO;
import com.knowledge.wiki.service.entity.vo.PageVO;
import com.knowledge.wiki.service.entity.vo.SpaceVO;
import com.knowledge.wiki.service.entity.vo.BacklinkVO;
import com.knowledge.wiki.service.entity.vo.GraphEdgeVO;
import com.knowledge.wiki.service.entity.vo.GraphNodeVO;
import com.knowledge.wiki.service.entity.vo.SpaceGraphVO;
import com.knowledge.wiki.service.exception.WikiException;
import com.knowledge.wiki.service.entity.enums.CollaboratorRole;
import com.knowledge.wiki.service.entity.PageCollaborator;
import com.knowledge.wiki.service.entity.PageContent;
import com.knowledge.wiki.service.entity.ShareLink;
import com.knowledge.wiki.service.entity.SpacePermission;
import com.knowledge.wiki.service.entity.WikiLink;
import com.knowledge.wiki.service.entity.BlockVersion;
import com.knowledge.wiki.service.entity.vo.BlockVersionVO;
import com.knowledge.wiki.service.service.IFavoriteService;
import com.knowledge.wiki.service.service.IPageService;
import com.knowledge.wiki.service.service.IPageSnapshotService;
import com.knowledge.wiki.service.service.IPageCollaboratorService;
import com.knowledge.wiki.service.service.IShareLinkService;
import com.knowledge.wiki.service.service.ISpaceService;
import com.knowledge.wiki.service.service.IWikiLinkService;
import com.knowledge.wiki.service.service.IBlockVersionService;
import com.knowledge.wiki.service.service.ISpaceMemberService;
import com.knowledge.system.vo.UserVO;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.collection.CollUtil;
import cn.hutool.core.collection.ListUtil;
import cn.hutool.core.lang.tree.Tree;
import cn.hutool.core.util.StrUtil;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class SpaceApplication {

    private static final String COLL_INVITATION = "space.page.cooperation.invite";
    private static final String DEFAULT_PERMISSION = "READ";
    private static final String COLLABORATE_URL_PREFIX = "/collaborate/";
    private static final String INVITATION_MESSAGE_TYPE = "INVITATION";
    private static final String INVITATION_TYPE_COLLABORATION = "COLLABORATION_INVITATION";

    @Autowired
    private ISpaceService spaceService;
    @Autowired
    private IPageService pageService;

    @Autowired
    private IFavoriteService favoriteService;
    @Autowired
    private IUserClient userClient;
    @Autowired
    private IMessageClient messageClient;
    @Autowired
    private IPageCollaboratorService pageCollaboratorService;
    @Autowired
    private IShareLinkService shareLinkService;
    @Autowired
    private IWikiLinkService wikiLinkService;
    @Autowired
    private IBlockVersionService blockVersionService;
    @Autowired
    private IPageSnapshotService pageSnapshotService;
    @Autowired
    private ISpaceMemberService spaceMemberService;

    /**
     * Create a new space
     * For COLLABORATION type spaces, automatically adds the creator as OWNER member
     *
     * @param dto space data transfer object
     */
    public void createSpace(SpaceDTO dto) {
        log.info("Creating space: {}", dto.getName());
        Space space = SpaceConverter.INSTANCE.convertDO(dto);
        Space savedSpace = spaceService.createOrSave(space);

        // For team/collaboration spaces, add creator as OWNER member
        if (savedSpace != null && savedSpace.getId() != null
                && (dto.getType() == SpaceType.COLLABORATION
                        || dto.getType() == SpaceType.SPACE)) {
            Long userId = SecurityContextUtil.getUserId();
            spaceMemberService.addMember(savedSpace.getId(), userId, CollaboratorRole.OWNER, null);
            log.info("Added creator {} as OWNER of team space {}", userId, savedSpace.getId());
        }

        log.info("Space created successfully: {}", dto.getName());
    }

    public List<PageVO> queryFavoritePage(QueryFavoriteDTO dto) {
        MPJLambdaWrapper<FavoriteItem> wrapper = MPJWrappers.lambdaJoin(FavoriteItem.class);
        wrapper.leftJoin(Page.class, Page::getId, FavoriteItem::getObjectId)
                .selectAll(Page.class)
                .eq(StrUtil.isNotBlank(dto.getScope()), FavoriteItem::getScope, dto.getScope());
        return favoriteService.selectJoinList(PageVO.class, wrapper);
    }

    /**
     * Get space details by ID
     *
     * @param spaceId space ID
     * @return space details with favorite status
     */
    public SpaceVO spaceDetail(Long spaceId) {
        if (spaceId == null) {
            throw WikiException.INVALID_PARAMETER.newException();
        }
        Space space = spaceService.getById(spaceId);
        if (space == null) {
            throw WikiException.SPACE_NOT_FOUND.newException();
        }
        SpaceVO spaceVO = SpaceConverter.INSTANCE.convertVO(space);
        spaceVO.setFavorite(favoriteService.checkFavorite(spaceId, SecurityContextUtil.getUserId()));
        return spaceVO;
    }

    /**
     * Get personal space for current user
     * Creates one if it doesn't exist
     *
     * @return personal space details
     */
    public SpaceVO getPersonalSpace() {
        return SpaceConverter.INSTANCE.convertVO(
                spaceService.getPersonalSpace(SecurityContextUtil.getUserId()));
    }

    public void acceptInvitation(Long id) {
        spaceService.acceptInvitation(id);
    }

    public void acceptInvitationByToken(String token) {
        spaceService.acceptInvitationByToken(token);
    }

    public void rejectInvitation(Long id) {
        spaceService.rejectInvitation(id);
    }

    /**
     * Create collaboration invitation
     * POST /knowledge-wiki/space/collaborationInvitation
     */
    @Transactional(rollbackFor = Exception.class)
    public CollaborationInvitationResponseDTO createCollaborationInvitation(CollaborationInvitationRequestDTO dto) {
        log.info("Creating collaboration invitation for pageId: {}, spaceId: {}",
                dto.getPageId(), dto.getSpaceId());
        CollaborationInvitationResponseDTO response = new CollaborationInvitationResponseDTO();
        response.setCreatedAt(java.time.LocalDateTime.now());

        List<String> failedEmails = new ArrayList<>();
        List<KnowledgeUser> users = fetchUsersByIdsAndEmails(
                dto.getCollaboratorIds(),
                dto.getCollaboratorEmails(),
                failedEmails);

        if (CollUtil.isEmpty(users)) {
            response.setSuccessCount(0);
            response.setFailedEmails(failedEmails);
            return response;
        }

        // Create and save invitations
        List<CollaborationInvitation> invitations = buildInvitations(users, dto);
        List<CollaborationInvitation> savedInvitations = spaceService.getCollaborationService()
                .createCollaborationInvitation(invitations);
        sendCollMessage(savedInvitations);

        // Set response fields
        if (CollUtil.isNotEmpty(savedInvitations)) {
            CollaborationInvitation firstInvitation = savedInvitations.get(0);
            response.setInvitationId(firstInvitation.getId());
            response.setInvitationToken(firstInvitation.getToken());
            response.setCollaborateUrl(COLLABORATE_URL_PREFIX + firstInvitation.getToken());
        }
        response.setSuccessCount(savedInvitations.size());
        response.setFailedEmails(failedEmails);
        log.info("Collaboration invitation created. Success: {}, Failed: {}",
                savedInvitations.size(), failedEmails.size());
        return response;
    }

    /**
     * Fetch users by IDs and emails
     *
     * @param userIds      list of user IDs
     * @param emails       list of user emails
     * @param failedEmails list to collect emails that failed to fetch
     * @return list of successfully fetched users
     */
    private List<KnowledgeUser> fetchUsersByIdsAndEmails(
            List<Long> userIds,
            List<String> emails,
            List<String> failedEmails) {
        List<KnowledgeUser> users = new ArrayList<>();

        // Get users by IDs
        if (CollUtil.isNotEmpty(userIds)) {
            List<KnowledgeUser> usersByIds = ApiClientUtil.resolvingResponse(
                    userClient.listByIds(userIds));
            if (CollUtil.isNotEmpty(usersByIds)) {
                users.addAll(usersByIds);
            }
        }

        // Get users by emails
        if (CollUtil.isNotEmpty(emails)) {
            List<KnowledgeUser> usersByEmails = ApiClientUtil.resolvingResponse(
                    userClient.getByAccount(emails));
            if (CollUtil.isNotEmpty(usersByEmails)) {
                users.addAll(usersByEmails);
                // Find failed emails (not found in system)
                List<String> foundEmails = usersByEmails.stream()
                        .map(KnowledgeUser::getAccount)
                        .collect(Collectors.toList());
                emails.stream()
                        .filter(email -> !foundEmails.contains(email))
                        .forEach(failedEmails::add);
            } else {
                failedEmails.addAll(emails);
            }
        }

        return users;
    }

    /**
     * Build invitation entities from users and DTO
     *
     * @param users list of users to invite
     * @param dto   collaboration invitation request
     * @return list of invitation entities
     */
    private List<CollaborationInvitation> buildInvitations(
            List<KnowledgeUser> users,
            CollaborationInvitationRequestDTO dto) {
        Long inviterId = SecurityContextUtil.getUserId();
        String permission = CollUtil.isNotEmpty(dto.getPermissions())
                ? dto.getPermissions().get(0)
                : DEFAULT_PERMISSION;

        return users.stream().map(user -> {
            CollaborationInvitation invitation = new CollaborationInvitation();
            invitation.setSpaceId(dto.getSpaceId());
            invitation.setPageId(dto.getPageId());
            invitation.setPermission(permission);
            invitation.setInviteeId(user.getUserId());
            invitation.setInviterId(inviterId);
            invitation.setMessage(dto.getMessage());
            return invitation;
        }).collect(Collectors.toList());
    }

    private void sendCollMessage(List<CollaborationInvitation> invitations) {
        if (CollUtil.isNotEmpty(invitations)) {
            Page page = this.spaceService.getPageService().getById(invitations.get(0).getPageId());
            Long senderId = SecurityContextUtil.getUserId();
            String senderName = SecurityContextUtil.getUserName();

            invitations.forEach(it -> {
                // Build notification data
                Map<String, Object> data = new HashMap<>();
                data.put("invitationId", it.getId());
                data.put("token", it.getToken());
                data.put("title", senderName + "邀请你加入协作");
                data.put("description", "页面名称 " + page.getTitle());
                data.put("url", COLLABORATE_URL_PREFIX + it.getToken());
                data.put("pageId", page.getId());
                data.put("spaceId", it.getSpaceId());
                data.put("permission", it.getPermission());
                data.put("type", INVITATION_TYPE_COLLABORATION);

                // Build message content
                String content = senderName + "邀请你加入协作: " + page.getTitle() + ", url:" + data.get("url");

                // Send instant message (persisted to database and sent via WebSocket)
                messageClient.sendInstantMessage(
                        senderId,
                        it.getInviteeId(),
                        content,
                        INVITATION_MESSAGE_TYPE,
                        data);
            });
        }
    }

    public PageVO getPageContent(Long pageId) {
        if (pageId == null) {
            throw WikiException.INVALID_PARAMETER.newException();
        }
        Page page = spaceService.getPageService().getPageContent(pageId);
        if (page == null) {
            throw WikiException.PAGE_NOT_FOUND.newException();
        }
        PageVO vo = PageConverter.INSTANCE.convertVO(page);
        vo.setFavorite(favoriteService.checkFavorite(pageId, SecurityContextUtil.getUserId()));

        // Get and set parent pages
        List<Page> parentPages = spaceService.getPageService().getParents(pageId);
        if (CollUtil.isNotEmpty(parentPages)) {
            List<PageVO> parentVOs = parentPages.stream()
                    .map(PageConverter.INSTANCE::convertVO)
                    .collect(Collectors.toList());
            vo.setParents(parentVOs);
        }

        // Get and set backlinks
        vo.setBacklinks(getPageBacklinks(pageId));

        return vo;
    }

    public List<BacklinkVO> getPageBacklinks(Long pageId) {
        if (pageId == null) {
            throw WikiException.INVALID_PARAMETER.newException();
        }
        Page page = spaceService.getPageService().getById(pageId);
        if (page == null) {
            throw WikiException.PAGE_NOT_FOUND.newException();
        }

        List<WikiLink> links = wikiLinkService.lambdaQuery()
                .eq(WikiLink::getTargetType, "PAGE")
                .eq(WikiLink::getTargetPageId, pageId)
                .list();
        if (CollUtil.isEmpty(links)) {
            return new ArrayList<>();
        }

        List<Long> sourcePageIds = links.stream()
                .map(WikiLink::getSourcePageId)
                .filter(id -> id != null && !id.equals(pageId))
                .distinct()
                .collect(Collectors.toList());

        Map<Long, Page> pageMap = new HashMap<>();
        if (CollUtil.isNotEmpty(sourcePageIds)) {
            List<Page> pages = spaceService.getPageService().listByIds(sourcePageIds);
            if (CollUtil.isNotEmpty(pages)) {
                pageMap = pages.stream().collect(Collectors.toMap(Page::getId, p -> p));
            }
        }

        List<BacklinkVO> result = new ArrayList<>();
        for (WikiLink link : links) {
            BacklinkVO backlink = new BacklinkVO();
            backlink.setSourceType(link.getSourceType());
            backlink.setSourceId(link.getSourceId());
            backlink.setSourcePageId(link.getSourcePageId());
            backlink.setSnippet(link.getSnippet());
            backlink.setLinkKind(link.getLinkKind());

            Page sourcePage = pageMap.get(link.getSourcePageId());
            if (sourcePage != null) {
                backlink.setSourcePageTitle(sourcePage.getTitle());
                backlink.setSourcePageIcon(sourcePage.getIcon());
                if (sourcePage.getSpaceId() != null) {
                    backlink.setSourceSpaceId(String.valueOf(sourcePage.getSpaceId()));
                }
            }

            if ("BLOCK".equalsIgnoreCase(link.getSourceType())) {
                backlink.setSourceBlockId(link.getSourceId());
            }

            result.add(backlink);
        }

        return result;
    }

    public List<BacklinkVO> getBlockBacklinks(String blockId) {
        if (StrUtil.isBlank(blockId)) {
            throw WikiException.INVALID_PARAMETER.newException();
        }

        List<WikiLink> links = wikiLinkService.lambdaQuery()
                .eq(WikiLink::getTargetType, "BLOCK")
                .eq(WikiLink::getTargetId, blockId)
                .list();
        if (CollUtil.isEmpty(links)) {
            return new ArrayList<>();
        }

        List<Long> sourcePageIds = links.stream()
                .map(WikiLink::getSourcePageId)
                .filter(id -> id != null)
                .distinct()
                .collect(Collectors.toList());

        Map<Long, Page> pageMap = new HashMap<>();
        if (CollUtil.isNotEmpty(sourcePageIds)) {
            List<Page> pages = spaceService.getPageService().listByIds(sourcePageIds);
            if (CollUtil.isNotEmpty(pages)) {
                pageMap = pages.stream().collect(Collectors.toMap(Page::getId, p -> p));
            }
        }

        List<BacklinkVO> result = new ArrayList<>();
        for (WikiLink link : links) {
            BacklinkVO backlink = new BacklinkVO();
            backlink.setSourceType(link.getSourceType());
            backlink.setSourceId(link.getSourceId());
            backlink.setSourcePageId(link.getSourcePageId());
            backlink.setSnippet(link.getSnippet());
            backlink.setLinkKind(link.getLinkKind());

            Page sourcePage = pageMap.get(link.getSourcePageId());
            if (sourcePage != null) {
                backlink.setSourcePageTitle(sourcePage.getTitle());
                backlink.setSourcePageIcon(sourcePage.getIcon());
                if (sourcePage.getSpaceId() != null) {
                    backlink.setSourceSpaceId(String.valueOf(sourcePage.getSpaceId()));
                }
            }

            if ("BLOCK".equalsIgnoreCase(link.getSourceType())) {
                backlink.setSourceBlockId(link.getSourceId());
            }

            result.add(backlink);
        }

        return result;
    }

    /**
     * Build the page relation graph for every space the current user can see.
     *
     * <p>
     * Visible spaces = spaces the user owns (any non-template type) ∪ spaces
     * the user has an explicit permission row for. Nodes are the live pages
     * (not deleted / trashed / template) in those spaces; edges are page-level
     * references from {@code wiki_link} whose both endpoints are visible nodes.
     *
     * <p>
     * All ids are emitted as strings to preserve 19-digit snowflake precision
     * on the JS frontend.
     */
    public SpaceGraphVO getSpaceGraph() {
        SpaceGraphVO graph = new SpaceGraphVO();
        Long uid = SecurityContextUtil.getUserId();
        if (uid == null) {
            return graph;
        }

        // 1) Collect visible space ids: owned (non-template) ∪ permitted.
        Set<Long> spaceIds = new HashSet<>();
        Map<Long, String> spaceNames = new HashMap<>();
        List<Space> ownedSpaces = spaceService.lambdaQuery()
                .eq(Space::getUserId, uid)
                .ne(Space::getType, SpaceType.TEMPALTE)
                .list();
        for (Space s : ownedSpaces) {
            spaceIds.add(s.getId());
            spaceNames.put(s.getId(), s.getName());
        }

        List<SpacePermission> permissions = spaceService.getSpacePermissionService().lambdaQuery()
                .eq(SpacePermission::getUserId, uid)
                .list();
        List<Long> permittedIds = permissions.stream()
                .map(SpacePermission::getSpaceId)
                .filter(id -> id != null && !spaceIds.contains(id))
                .distinct()
                .collect(Collectors.toList());
        if (CollUtil.isNotEmpty(permittedIds)) {
            spaceIds.addAll(permittedIds);
            List<Space> permittedSpaces = spaceService.lambdaQuery()
                    .in(Space::getId, permittedIds)
                    .list();
            for (Space s : permittedSpaces) {
                spaceNames.put(s.getId(), s.getName());
            }
        }

        if (CollUtil.isEmpty(spaceIds)) {
            return graph;
        }

        // 2) Page nodes: live pages in the visible spaces.
        List<Page> pages = spaceService.getPageService().lambdaQuery()
                .in(Page::getSpaceId, spaceIds)
                .ne(Page::getStatus, PageStatus.DELETED)
                .ne(Page::getStatus, PageStatus.TRASH)
                .eq(Page::getIsTemplate, false)
                .list();

        Set<Long> pageIdSet = new HashSet<>();
        List<GraphNodeVO> nodes = new ArrayList<>();
        for (Page page : pages) {
            pageIdSet.add(page.getId());
            GraphNodeVO node = new GraphNodeVO();
            node.setId(String.valueOf(page.getId()));
            node.setTitle(page.getTitle());
            node.setSpaceId(page.getSpaceId() != null ? String.valueOf(page.getSpaceId()) : null);
            node.setSpaceName(page.getSpaceId() != null ? spaceNames.get(page.getSpaceId()) : null);
            node.setIcon(page.getIcon());
            node.setStatus(page.getStatus() != null ? page.getStatus().getValue() : null);
            nodes.add(node);
        }
        graph.setNodes(nodes);

        if (pageIdSet.isEmpty()) {
            return graph;
        }

        // 3) Edges: page-level links whose both endpoints are visible nodes.
        List<Long> pageIds = new ArrayList<>(pageIdSet);
        List<WikiLink> links = wikiLinkService.lambdaQuery()
                .eq(WikiLink::getTargetType, "PAGE")
                .in(WikiLink::getSourcePageId, pageIds)
                .in(WikiLink::getTargetPageId, pageIds)
                .list();

        Set<String> seenEdges = new HashSet<>();
        List<GraphEdgeVO> edges = new ArrayList<>();
        for (WikiLink link : links) {
            Long src = link.getSourcePageId();
            Long tgt = link.getTargetPageId();
            // Skip incomplete links, self-loops, and endpoints outside the node set.
            if (src == null || tgt == null || src.equals(tgt)) {
                continue;
            }
            if (!pageIdSet.contains(src) || !pageIdSet.contains(tgt)) {
                continue;
            }
            // Collapse multiple links between the same ordered pair into one edge.
            String key = src + "->" + tgt;
            if (!seenEdges.add(key)) {
                continue;
            }
            GraphEdgeVO edge = new GraphEdgeVO();
            edge.setSource(String.valueOf(src));
            edge.setTarget(String.valueOf(tgt));
            edge.setLinkKind(link.getLinkKind());
            edges.add(edge);
        }
        graph.setEdges(edges);

        return graph;
    }

    public PageVO createPage(PageDTO dto) {
        if (dto.getTemplateId() == null) {
            Page page = PageConverter.INSTANCE.convertDO(dto);
            return PageConverter.INSTANCE.convertVO(spaceService.getPageService().createPage(page, dto.isPublish()));
        }
        return PageConverter.INSTANCE.convertVO(spaceService.getPageService().createByTemplate(dto.getTemplateId(),
                dto.getSpaceId(), dto.getParentId()));
    }

    public void savePageAsTemplate(Long pageId, SaveTemplateDTO dto) {
        this.spaceService.getPageService().saveAsTemplate(pageId, dto);
    }

    public void deleteTemplate(Long templateId) {
        this.spaceService.getPageService().delete(templateId);
    }

    public void movePageToTrash(Long pageId) {
        spaceService.getPageService().moveToTrash(pageId);
    }

    /**
     * Move a page to a different parent and/or space.
     *
     * @param pageId the page to move
     * @param dto    move parameters
     */
    public void movePage(Long pageId, com.knowledge.wiki.service.entity.dto.MovePageDTO dto) {
        spaceService.getPageService().movePage(pageId, dto.getTargetSpaceId(), dto.getTargetParentId());
    }

    public List<PageVO> queryTemplate(QueryPageTemplateDTO dto) {
        // Get templates from Page table (content now stored in blocks)
        List<Page> templates = spaceService.getPageService().lambdaQuery()
                .eq(Page::getIsTemplate, true)
                .ne(Page::getStatus, PageStatus.DELETED)
                .list();
        return templates.stream()
                .map(page -> {
                    PageVO vo = PageConverter.INSTANCE.convertVO(page);
                    // Get content from block storage
                    vo.setContent(spaceService.getPageService().getPageContentFromBlocks(page.getId()));
                    return vo;
                })
                .collect(Collectors.toList());
    }

    public List<Tree<Long>> getSpacePageTree(Long spaceId, String searchValue) {
        List<Tree<Long>> tree = spaceService.getPageService().getPageTree(spaceId, searchValue);
        if (tree != null) {
            tree.forEach(it -> {
                it.walk(t -> {
                    t.putExtra("favorite", favoriteService.checkFavorite(t.getId(), SecurityContextUtil.getUserId()));
                });
            });
        }
        return tree;
    }

    public void addFavoritePage(Long pageId) {
        Page page = spaceService.getPageService().getById(pageId);
        if (page == null) {
            throw WikiException.PAGE_NOT_FOUND.newException();
        }
        FavoriteItem favoriteItem = FavoriteItemConverter.INSTANCE.convert(page);
        favoriteService.create(favoriteItem);
    }

    public void addFavoriteSpace(Long spaceId) {
        Space space = spaceService.getById(spaceId);
        if (space == null) {
            throw WikiException.SPACE_NOT_FOUND.newException();
        }
        FavoriteItem favoriteItem = FavoriteItemConverter.INSTANCE.convert(space);
        favoriteService.create(favoriteItem);
    }

    public IPage<SpaceVO> page(QuerySpaceDTO dto) {
        MPJLambdaWrapper<Space> wrapper = MPJWrappers.lambdaJoin(Space.class);
        wrapper.selectAll(Space.class);

        if (dto.isTemplate()) {
            wrapper.eq(Space::getType, SpaceType.TEMPALTE);
        } else if (dto.getType() != null) {
            // Filter by specific type
            wrapper.eq(Space::getType, dto.getType());
        } else {
            // Default: show both SPACE and COLLABORATION types
            wrapper.in(Space::getType, SpaceType.SPACE, SpaceType.COLLABORATION);
        }

        // Search by name
        if (dto.getSearchValue() != null && !dto.getSearchValue().isEmpty()) {
            wrapper.like(Space::getName, dto.getSearchValue());
        }

        wrapper.orderByDesc(Space::getCreateTime);

        if (dto.isFavorite()) {
            wrapper.leftJoin(FavoriteItem.class, FavoriteItem::getObjectId, Space::getId)
                    .isNotNull(dto.isFavorite(), FavoriteItem::getObjectId);
        }
        return this.spaceService.selectJoinListPage(dto.page(), SpaceVO.class, wrapper);
    }

    public IPage<PageVO> queryRecentPage(QueryPageDTO dto) {
        IPage<PageVO> page = PageConverter.INSTANCE.convertVO(
                spaceService.getPageService().queryRecentPage(dto.getSearchValue(), dto));
        return page;
    }

    public void restorePage(Long pageId) {
        spaceService.getPageService().restore(pageId);
    }

    public void refreshBlock() {
        List<Long> activeVersions = this.pageService.getAllActiveVersions().stream().map(PageVersion::getId)
                .collect(Collectors.toList());
        pageService.refreshBlock(activeVersions);
    }

    public IPage<PageVO> queryPage(QueryPageDTO dto) {
        return PageConverter.INSTANCE.convertVO(
                this.spaceService.getPageService().lambdaQuery()
                        .eq(dto.getSpaceId() != null, Page::getSpaceId, dto.getSpaceId())
                        .eq(dto.getStatus() != null, Page::getStatus, dto.getStatus())
                        // When no explicit status is requested (e.g. cross-space link
                        // search with spaceId omitted), exclude trashed/deleted pages.
                        .ne(dto.getStatus() == null, Page::getStatus, PageStatus.DELETED)
                        .ne(dto.getStatus() == null, Page::getStatus, PageStatus.TRASH)
                        .like(StrUtil.isNotEmpty(dto.getSearchValue()), Page::getTitle, dto.getSearchValue())
                        .page(dto.page()));
    }

    public IPage<PageContentVO> queryPageBlock(QueryPageBlockDTO dto) {
        MPJLambdaWrapper<PageContent> wrapper = MPJWrappers.lambdaJoin(PageContent.class);
        wrapper.selectAll(PageContent.class)
                .leftJoin(Page.class, Page::getId, PageContent::getPageId)
                .leftJoin(Space.class, Space::getId, Page::getSpaceId)
                .selectAs(Page::getSpaceId, PageBlockVO::getSpaceId)
                .selectAs(Space::getName, PageBlockVO::getSpaceName)
                .selectAs(Page::getTitle, PageBlockVO::getPageTitle)
                .like(StrUtil.isNotBlank(dto.getSearchValue()), PageContent::getText, dto.getSearchValue())
                .eq(StrUtil.isNotBlank(dto.getType()), PageContent::getType, dto.getType())
                .eq(dto.getSpaceId() != null, Space::getId, dto.getSpaceId())
                .eq(dto.getPageId() != null, PageContent::getPageId, dto.getPageId())
                .distinct();
        return this.spaceService.getPageService().getPageContentService()
                .selectJoinListPage(dto.page(), PageContentVO.class, wrapper);
    }

    public PageBlockVO getBlockInfo(String id) {
        return this.pageService.getBlockInfo(id);
    }

    /**
     * 获取块详细信息（包含子节点）
     */
    public PageBlockDetailVO getBlockDetailInfo(String blockId) {
        PageContent blockContent = this.pageService.getBlockDetailInfo(blockId);
        if (blockContent == null) {
            return null;
        }

        // 查询页面和空间信息
        Long pageId = blockContent.getPageId();
        Page page = pageId != null ? this.pageService.getById(pageId) : null;
        Long spaceId = page != null ? page.getSpaceId() : null;
        String pageTitle = page != null ? page.getTitle() : null;
        String spaceName = null;
        if (spaceId != null) {
            Space space = spaceService.getById(spaceId);
            spaceName = space != null ? space.getName() : null;
        }

        return convertToBlockDetailVO(blockContent, pageTitle, spaceId, spaceName);
    }

    /**
     * 递归将 PageContent 转换为 PageBlockDetailVO
     */
    private PageBlockDetailVO convertToBlockDetailVO(PageContent content, String pageTitle, Long spaceId,
            String spaceName) {
        PageBlockDetailVO vo = new PageBlockDetailVO();
        vo.setId(content.getId());
        vo.setType(content.getType());
        vo.setText(content.getText());
        vo.setAttrs(content.getAttrs());
        vo.setMarks(content.getMarks() != null ? content.getMarks().stream()
                .map(m -> cn.hutool.json.JSONUtil.parseObj(cn.hutool.json.JSONUtil.toJsonStr(m)))
                .collect(Collectors.toList()) : null);
        vo.setParentId(content.getParentId());
        vo.setPageId(content.getPageId());
        vo.setPageTitle(pageTitle);
        vo.setSpaceId(spaceId);
        vo.setSpaceName(spaceName);
        vo.setPath(content.getPath());
        vo.setFullPath(content.getFullPath());

        // 递归转换子节点
        if (CollUtil.isNotEmpty(content.getContent())) {
            List<PageBlockDetailVO> children = content.getContent().stream()
                    .map(child -> convertToBlockDetailVO(child, pageTitle, spaceId, spaceName))
                    .collect(Collectors.toList());
            vo.setChildren(children);
        }

        return vo;
    }

    /**
     * 更新块内容
     */
    public boolean updateBlock(UpdateBlockDTO updateDto) {
        return this.pageService.updateBlock(updateDto);
    }

    /**
     * Apply an incremental block-level patch from the frontend DirtyTracker.
     * Only the modified top-level blocks are persisted; deletions cascade to
     * descendants. The block storage layer atomically seals the change set
     * into a brand-new ACTIVE {@code PageVersion} (save = publish), so there
     * is no separate publish flag or async fan-out.
     *
     * @return PatchResultDTO with statistics, the new page version, and any
     *         detected conflicts
     */
    public PatchResultDTO patchPageBlocks(com.knowledge.wiki.service.entity.dto.PatchPageBlocksDTO dto) {
        com.knowledge.wiki.service.service.impl.BlockStorageService.PatchResult result = this.pageService
                .patchBlocks(dto.getPageId(), dto.getChanges(), dto.getBlockOrder());
        syncPageTitleFromPatch(dto, result);

        return PatchResultDTO.from(result);
    }

    /**
     * Bulk-replace path for a first import / paste of a very large document.
     * Reuses the same request shape as {@link #patchPageBlocks} but routes to the
     * chunked, version-history-free bulk persistence path. Frontend only calls
     * this when every change is an upsert of a brand-new block (fresh import).
     */
    public PatchResultDTO bulkReplacePageBlocks(com.knowledge.wiki.service.entity.dto.PatchPageBlocksDTO dto) {
        com.knowledge.wiki.service.service.impl.BlockStorageService.PatchResult result = this.pageService
                .bulkReplaceBlocks(dto.getPageId(), dto.getChanges());
        syncPageTitleFromPatch(dto, result);

        return PatchResultDTO.from(result);
    }

    private void syncPageTitleFromPatch(
            com.knowledge.wiki.service.entity.dto.PatchPageBlocksDTO dto,
            com.knowledge.wiki.service.service.impl.BlockStorageService.PatchResult result) {
        if (dto == null || dto.getPageId() == null || CollUtil.isEmpty(dto.getChanges())) {
            return;
        }
        List<String> conflicts = result != null ? result.getConflictBlockIds() : null;
        com.knowledge.wiki.service.entity.dto.BlockPatchItemDTO titleChange = null;
        for (com.knowledge.wiki.service.entity.dto.BlockPatchItemDTO ch : dto.getChanges()) {
            if (ch == null || ch.getAction() == null || ch.getType() == null) {
                continue;
            }
            String action = ch.getAction();
            if (!"upsert".equalsIgnoreCase(action) && !"update".equalsIgnoreCase(action)) {
                continue;
            }
            if (!"title".equalsIgnoreCase(ch.getType())) {
                continue;
            }
            if (conflicts != null && conflicts.contains(ch.getBlockId())) {
                continue;
            }
            titleChange = ch;
            break;
        }
        if (titleChange == null || StrUtil.isBlank(titleChange.getContent())) {
            return;
        }

        Page existing = pageService.getById(dto.getPageId());
        if (existing == null) {
            return;
        }

        // Parse the title block JSON to extract text, icon, and cover
        cn.hutool.json.JSONObject root;
        try {
            root = cn.hutool.json.JSONUtil.parseObj(titleChange.getContent());
        } catch (Exception e) {
            log.warn("patchPageBlocks: failed to parse title block JSON: {}", e.getMessage());
            return;
        }

        // --- Sync title text ---
        String newTitle = extractTitleText(titleChange.getContent());
        if (newTitle == null) {
            return;
        }
        String existingTitle = existing.getTitle() != null ? existing.getTitle() : "";
        boolean titleChanged = !newTitle.equals(existingTitle);

        // --- Sync icon from title block attrs ---
        cn.hutool.json.JSONObject attrs = root.getJSONObject("attrs");
        boolean iconChanged = false;
        Icon newIcon = null;
        if (attrs != null && attrs.containsKey("icon")) {
            cn.hutool.json.JSONObject iconObj = attrs.getJSONObject("icon");
            if (iconObj != null) {
                newIcon = new Icon();
                newIcon.setIcon(iconObj.getStr("icon"));
                String typeStr = iconObj.getStr("type");
                if (typeStr != null) {
                    try {
                        newIcon.setType(IconType.valueOf(typeStr));
                    } catch (IllegalArgumentException ignored) {
                    }
                }
            }
            // Compare new icon with existing icon
            String newIconStr = newIcon != null ? newIcon.getIcon() : null;
            String existingIconStr = existing.getIcon() != null ? existing.getIcon().getIcon() : null;
            iconChanged = !java.util.Objects.equals(newIconStr, existingIconStr);
        }

        if (!titleChanged && !iconChanged) {
            return;
        }

        // Use a targeted UPDATE — only set the columns that actually changed.
        // This avoids overwriting other fields with their Java defaults.
        try {
            if (titleChanged) {
                pageService.lambdaUpdate()
                        .eq(Page::getId, existing.getId())
                        .set(Page::getTitle, newTitle)
                        .update();
            }
            if (iconChanged) {
                // Icon maps to a JSON column via JacksonTypeHandler (@TableField on
                // Page.icon). lambdaUpdate().set() does NOT pick up that handler
                // automatically, so it must be named explicitly here or the Icon
                // object would be bound as a raw parameter and fail to persist.
                pageService.lambdaUpdate()
                        .eq(Page::getId, existing.getId())
                        .set(Page::getIcon, newIcon,
                                "typeHandler=com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler")
                        .update();
            }
        } catch (Exception e) {
            // Title/icon sync is best-effort; never fail the save because of it.
            log.warn("patchPageBlocks: failed to sync Page.title/icon for pageId={}: {}",
                    dto.getPageId(), e.getMessage());
        }
    }

    /**
     * Extract the plain-text heading content from a serialized title block.
     * The title block follows the schema {@code title { heading { text* } }};
     * any non-text inline children are tolerated and skipped. Returns the
     * concatenated text or {@code null} when the structure is unexpected.
     */
    private String extractTitleText(String contentJson) {
        if (StrUtil.isBlank(contentJson)) {
            return null;
        }
        try {
            cn.hutool.json.JSONObject root = cn.hutool.json.JSONUtil.parseObj(contentJson);
            cn.hutool.json.JSONArray titleChildren = root.getJSONArray("content");
            if (titleChildren == null || titleChildren.isEmpty()) {
                return "";
            }
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < titleChildren.size(); i++) {
                cn.hutool.json.JSONObject heading = titleChildren.getJSONObject(i);
                if (heading == null)
                    continue;
                cn.hutool.json.JSONArray inline = heading.getJSONArray("content");
                if (inline == null)
                    continue;
                for (int j = 0; j < inline.size(); j++) {
                    cn.hutool.json.JSONObject leaf = inline.getJSONObject(j);
                    if (leaf == null)
                        continue;
                    String text = leaf.getStr("text");
                    if (text != null) {
                        sb.append(text);
                    }
                }
            }
            return sb.toString();
        } catch (Exception e) {
            log.warn("patchPageBlocks: failed to parse title block content: {}", e.getMessage());
            return null;
        }
    }

    /**
     * Search blocks by content
     * Note: Implementation pending - currently returns empty list
     */
    public List<PageBlockDetailVO> searchBlocks(String keyword, Long pageId, Long spaceId) {
        // TODO: Implement block search using block storage
        return new ArrayList<>();
    }

    public void saveAsTemplate(TemplateDTO dto) {
        Space space = spaceService.getById(dto.getSpaceId());
        Space newSpace = BeanUtil.copyProperties(space, Space.class, "id");
        newSpace.setScreenShot(dto.getScreenShot());
        newSpace.setDescription(dto.getDescription());
        newSpace.setType(SpaceType.TEMPALTE);
        spaceService.createOrSave(newSpace);
        pageService.copySpacePage(dto.getSpaceId(), newSpace.getId());
    }

    // ==================== Collaboration API Methods ====================

    public IPage<KnowledgeUser> searchUsers(String keyword, Integer pageSize) {
        return ApiClientUtil.resolvingResponse(userClient.searchUsers(keyword, pageSize));
    }

    public List<SpaceMemberDTO> getSpaceMembers(Long spaceId) {
        // Get space permissions for the space
        List<SpacePermission> permissions = spaceService.getSpacePermissionService()
                .lambdaQuery()
                .eq(SpacePermission::getSpaceId, spaceId)
                .list();

        if (CollUtil.isEmpty(permissions)) {
            // If no permissions exist, return only the space owner
            Space space = spaceService.getById(spaceId);
            if (space == null) {
                throw WikiException.SPACE_NOT_FOUND.newException();
            }
            if (space.getUserId() != null) {
                KnowledgeUser owner = ApiClientUtil.resolvingResponse(
                        userClient.getUserById(space.getUserId()));
                if (owner != null) {
                    SpaceMemberDTO memberDTO = new SpaceMemberDTO();
                    memberDTO.setId(owner.getUserId());
                    memberDTO.setName(owner.getUserName());
                    memberDTO.setEmail(owner.getEmail());
                    memberDTO.setRole(CollaboratorRole.OWNER.getCode());
                    memberDTO.setJoinedAt(space.getCreateTime());
                    return ListUtil.toList(memberDTO);
                }
            }
            return ListUtil.empty();
        }

        // Get user details for all members
        List<Long> userIds = permissions.stream()
                .map(SpacePermission::getUserId)
                .collect(Collectors.toList());
        List<KnowledgeUser> users = ApiClientUtil.resolvingResponse(
                userClient.listByIds(userIds));

        if (CollUtil.isEmpty(users)) {
            return ListUtil.empty();
        }

        // Create a map for quick user lookup
        Map<Long, KnowledgeUser> userMap = users.stream()
                .collect(Collectors.toMap(KnowledgeUser::getUserId, u -> u, (a, b) -> a));

        // Convert to DTOs
        Space space = spaceService.getById(spaceId);
        return permissions.stream()
                .map(perm -> {
                    KnowledgeUser user = userMap.get(perm.getUserId());
                    if (user == null) {
                        return null;
                    }
                    SpaceMemberDTO memberDTO = new SpaceMemberDTO();
                    memberDTO.setId(user.getUserId());
                    memberDTO.setName(user.getUserName());
                    memberDTO.setEmail(user.getEmail());
                    // Determine role based on permissions and ownership
                    if (space != null && space.getUserId() != null &&
                            space.getUserId().equals(user.getUserId())) {
                        memberDTO.setRole(CollaboratorRole.OWNER.getCode());
                    } else if (perm.getPermissions() != null &&
                            perm.getPermissions().contains(SpacePermissionEnum.ADMIN)) {
                        memberDTO.setRole(CollaboratorRole.ADMIN.getCode());
                    } else {
                        memberDTO.setRole(CollaboratorRole.MEMBER.getCode());
                    }
                    memberDTO.setJoinedAt(perm.getCreateTime());
                    return memberDTO;
                })
                .filter(m -> m != null)
                .collect(Collectors.toList());
    }

    public List<PageCollaboratorDTO> getPageCollaborators(Long pageId) {
        // Get all collaborators for this page
        List<PageCollaborator> collaborators = pageCollaboratorService.lambdaQuery()
                .eq(PageCollaborator::getPageId, pageId)
                .list();

        if (CollUtil.isEmpty(collaborators)) {
            return ListUtil.empty();
        }

        // Get user IDs including inviters
        List<Long> allUserIds = new ArrayList<>();
        collaborators.forEach(c -> {
            allUserIds.add(c.getUserId());
            if (c.getInvitedBy() != null) {
                allUserIds.add(c.getInvitedBy());
            }
        });
        List<Long> distinctUserIds = allUserIds.stream().distinct().collect(Collectors.toList());

        // Get user details
        List<KnowledgeUser> users = ApiClientUtil.resolvingResponse(
                userClient.listByIds(distinctUserIds));

        if (CollUtil.isEmpty(users)) {
            return ListUtil.empty();
        }

        // Create a map for quick user lookup
        Map<Long, KnowledgeUser> userMap = users.stream()
                .collect(Collectors.toMap(KnowledgeUser::getUserId, u -> u, (a, b) -> a));

        // Convert to DTOs
        return collaborators.stream()
                .map(collab -> {
                    KnowledgeUser user = userMap.get(collab.getUserId());
                    if (user == null) {
                        return null;
                    }
                    PageCollaboratorDTO dto = new PageCollaboratorDTO();
                    dto.setId(user.getUserId());
                    dto.setName(user.getUserName());
                    dto.setUsername(user.getAccount());
                    dto.setEmail(user.getEmail());
                    dto.setPermission(collab.getPermission());
                    dto.setInvitedAt(collab.getCreatedAt());

                    // Set inviter info
                    if (collab.getInvitedBy() != null) {
                        KnowledgeUser inviter = userMap.get(collab.getInvitedBy());
                        if (inviter != null) {
                            PageCollaboratorDTO.InvitedBy invitedBy = new PageCollaboratorDTO.InvitedBy();
                            invitedBy.setId(inviter.getUserId());
                            invitedBy.setName(inviter.getUserName());
                            dto.setInvitedBy(invitedBy);
                        }
                    }
                    return dto;
                })
                .filter(d -> d != null)
                .collect(Collectors.toList());
    }

    public void updateCollaboratorPermission(Long pageId, Long userId, String permission) {
        PageCollaborator collaborator = pageCollaboratorService.lambdaQuery()
                .eq(PageCollaborator::getPageId, pageId)
                .eq(PageCollaborator::getUserId, userId)
                .one();

        if (collaborator == null) {
            throw WikiException.COLLABORATOR_NOT_FOUND.newException();
        }

        collaborator.setPermission(permission);
        collaborator.setUpdatedAt(java.time.LocalDateTime.now());
        pageCollaboratorService.updateById(collaborator);
    }

    public void removePageCollaborator(Long pageId, Long userId) {
        pageCollaboratorService.lambdaUpdate()
                .eq(PageCollaborator::getPageId, pageId)
                .eq(PageCollaborator::getUserId, userId)
                .remove();
    }

    public ShareLinkResponseDTO generateShareLink(Long pageId, ShareLinkRequestDTO dto) {
        String shortCode = cn.hutool.core.util.IdUtil.fastSimpleUUID().substring(0, 9);

        ShareLink shareLink = new ShareLink();
        shareLink.setPageId(pageId);
        shareLink.setShortCode(shortCode);
        shareLink.setCreatedBy(SecurityContextUtil.getUserId());
        shareLink.setIsPublic(dto.getIsPublic() != null ? dto.getIsPublic() : false);
        shareLink.setPermission(dto.getPermission() != null ? dto.getPermission() : "READ");
        shareLink.setCreatedAt(java.time.LocalDateTime.now());

        if (dto.getExpiresIn() != null) {
            shareLink.setExpiresAt(java.time.LocalDateTime.now().plusDays(dto.getExpiresIn()));
        }

        shareLinkService.save(shareLink);

        ShareLinkResponseDTO response = new ShareLinkResponseDTO();
        response.setLink("https://app.example.com/share/" + shortCode);
        response.setShortCode(shortCode);
        response.setExpiresAt(shareLink.getExpiresAt());
        response.setIsPublic(shareLink.getIsPublic());
        response.setPermission(shareLink.getPermission());
        response.setCreatedAt(shareLink.getCreatedAt());

        return response;
    }

    /**
     * Get pages that the current user has been invited to collaborate on
     * GET /knowledge-wiki/space/page/invited
     */
    public List<InvitedPageVO> getInvitedPages() {
        Long currentUserId = SecurityContextUtil.getUserId();

        // Get all page collaborations for current user
        List<PageCollaborator> collaborations = pageCollaboratorService.lambdaQuery()
                .eq(PageCollaborator::getUserId, currentUserId)
                .list();

        if (CollUtil.isEmpty(collaborations)) {
            return ListUtil.empty();
        }

        // Get page IDs
        List<Long> pageIds = collaborations.stream()
                .map(PageCollaborator::getPageId)
                .distinct()
                .collect(Collectors.toList());

        // Get pages
        List<Page> pages = pageService.lambdaQuery()
                .in(Page::getId, pageIds)
                .list();

        if (CollUtil.isEmpty(pages)) {
            return ListUtil.empty();
        }

        // Get space IDs and fetch space info
        List<Long> spaceIds = pages.stream()
                .map(Page::getSpaceId)
                .distinct()
                .collect(Collectors.toList());
        List<Space> spaces = spaceService.lambdaQuery()
                .in(Space::getId, spaceIds)
                .list();
        Map<Long, Space> spaceMap = spaces.stream()
                .collect(Collectors.toMap(Space::getId, s -> s, (a, b) -> a));

        // Get inviter user IDs
        List<Long> inviterIds = collaborations.stream()
                .map(PageCollaborator::getInvitedBy)
                .filter(id -> id != null)
                .distinct()
                .collect(Collectors.toList());

        Map<Long, KnowledgeUser> inviterMap = new HashMap<>();
        if (CollUtil.isNotEmpty(inviterIds)) {
            List<KnowledgeUser> inviters = ApiClientUtil.resolvingResponse(
                    userClient.listByIds(inviterIds));
            if (CollUtil.isNotEmpty(inviters)) {
                inviterMap = inviters.stream()
                        .collect(Collectors.toMap(KnowledgeUser::getUserId, u -> u, (a, b) -> a));
            }
        }

        // Create page map for quick lookup
        Map<Long, Page> pageMap = pages.stream()
                .collect(Collectors.toMap(Page::getId, p -> p, (a, b) -> a));

        // Build response
        final Map<Long, KnowledgeUser> finalInviterMap = inviterMap;
        return collaborations.stream()
                .map(collab -> {
                    Page page = pageMap.get(collab.getPageId());
                    if (page == null) {
                        return null;
                    }

                    InvitedPageVO vo = new InvitedPageVO();
                    vo.setId(page.getId());
                    vo.setIcon(page.getIcon());
                    vo.setTitle(page.getTitle());
                    vo.setDescription(page.getDescription());
                    vo.setSpaceId(page.getSpaceId());
                    vo.setStatus(page.getStatus());
                    vo.setCover(page.getCover());
                    vo.setCreateTime(page.getCreateTime());
                    vo.setUpdateTime(page.getUpdateTime());

                    // Set space name
                    Space space = spaceMap.get(page.getSpaceId());
                    if (space != null) {
                        vo.setSpaceName(space.getName());
                    }

                    // Set collaboration info
                    vo.setPermission(collab.getPermission());
                    vo.setInvitedAt(collab.getCreatedAt());

                    // Set inviter info
                    if (collab.getInvitedBy() != null) {
                        KnowledgeUser inviter = finalInviterMap.get(collab.getInvitedBy());
                        if (inviter != null) {
                            InvitedPageVO.InvitedBy invitedBy = new InvitedPageVO.InvitedBy();
                            invitedBy.setId(inviter.getUserId());
                            invitedBy.setName(inviter.getUserName());
                            vo.setInvitedBy(invitedBy);
                        }
                    }

                    return vo;
                })
                .filter(v -> v != null)
                .collect(Collectors.toList());
    }

    // ==================== Version Management API ====================

    /**
     * Get page version history
     * 
     * @param dto query parameters
     * @return paginated version history
     */
    public IPage<PageVersion> getPageVersionHistory(com.knowledge.wiki.service.entity.dto.QueryPageVersionDTO dto) {
        return pageService.getPageVersionService().getVersionHistory(dto);
    }

    /**
     * Get all versions of a page
     * 
     * @param pageId page ID
     * @return list of all versions
     */
    public List<PageVersion> getPageVersions(Long pageId) {
        return pageService.getPageVersionService().getAllVersionsByPageId(pageId);
    }

    /**
     * Get specific version content
     * 
     * @param versionId version ID
     * @return version details
     */
    public PageVersion getPageVersion(Long versionId) {
        return pageService.getPageVersionService().getVersionById(versionId);
    }

    /**
     * Rollback page to specific version
     * 
     * @param pageId          page ID
     * @param targetVersionId target version ID
     * @param changeSummary   rollback summary
     * @return new version created from rollback
     */
    @Transactional(rollbackFor = Exception.class)
    public PageVersion rollbackPageVersion(Long pageId, Long targetVersionId, String changeSummary) {
        return pageService.getPageVersionService().rollbackToVersion(pageId, targetVersionId, changeSummary);
    }

    /**
     * Compare two versions
     * 
     * @param sourceVersionId source version ID
     * @param targetVersionId target version ID
     * @return comparison result
     */
    public String compareVersions(Long sourceVersionId, Long targetVersionId) {
        return pageService.getPageVersionService().compareVersions(sourceVersionId, targetVersionId);
    }

    /**
     * Delete draft version
     * 
     * @param pageId page ID
     */
    @Transactional(rollbackFor = Exception.class)
    public void deleteDraft(Long pageId) {
        pageService.getPageVersionService().deleteDraft(pageId);
    }

    /**
     * Get version count
     * 
     * @param pageId page ID
     * @return version count
     */
    public int getVersionCount(Long pageId) {
        return pageService.getPageVersionService().getVersionCount(pageId);
    }

    // ==================== Block Version API ====================

    /**
     * Get version history for a specific block
     *
     * @param blockId the block ID
     * @return list of block version VOs
     */
    public List<BlockVersionVO> getBlockHistory(String blockId) {
        List<BlockVersion> entities = blockVersionService.getBlockHistory(blockId);
        return BlockVersionConverter.INSTANCE.convertVO(entities);
    }

    /**
     * Get all block snapshots at a specific page version
     *
     * @param pageVersionId the page version ID
     * @return list of block version VOs
     */
    public List<BlockVersionVO> getBlocksAtPageVersion(Long pageVersionId) {
        List<BlockVersion> entities = blockVersionService.getBlocksAtVersion(pageVersionId);
        return BlockVersionConverter.INSTANCE.convertVO(entities);
    }

    /**
     * Get paginated block version history with flexible filtering.
     *
     * @param dto query parameters with pagination
     * @return paginated block version VO list
     */
    public IPage<BlockVersionVO> getBlockVersionHistory(
            com.knowledge.wiki.service.entity.dto.QueryBlockVersionDTO dto) {
        return blockVersionService.getBlockVersionHistory(dto);
    }

    // ==================== Page Tags & Featured ====================

    /**
     * Get templates scoped to a specific space (team space template library)
     */
    public List<PageVO> getSpaceTemplates(Long spaceId) {
        List<Page> templates = pageService.lambdaQuery()
                .eq(Page::getSpaceId, spaceId)
                .eq(Page::getIsTemplate, true)
                .ne(Page::getStatus, PageStatus.DELETED)
                .orderByDesc(Page::getUpdateTime)
                .list();
        return templates.stream()
                .map(page -> {
                    PageVO vo = PageConverter.INSTANCE.convertVO(page);
                    return vo;
                })
                .collect(Collectors.toList());
    }

    /**
     * Toggle the pinned status of a page within a space
     */
    public void togglePagePin(Long spaceId, Long pageId) {
        Page page = pageService.getById(pageId);
        if (page == null || !spaceId.equals(page.getSpaceId())) {
            throw WikiException.INVALID_PARAMETER.newException();
        }
        page.setPinned(!Boolean.TRUE.equals(page.getPinned()));
        pageService.updateById(page);
        log.info("Toggled pin status of page {} in space {} to {}", pageId, spaceId, page.getPinned());
    }

    /**
     * Get all pinned/featured pages in a space
     */
    public List<PageVO> getPinnedPages(Long spaceId) {
        List<Page> pages = pageService.lambdaQuery()
                .eq(Page::getSpaceId, spaceId)
                .eq(Page::getPinned, true)
                .orderByDesc(Page::getUpdateTime)
                .list();
        return pages.stream()
                .map(PageConverter.INSTANCE::convertVO)
                .collect(Collectors.toList());
    }

    /**
     * Update tags for a page
     */
    public void updatePageTags(Long pageId, List<String> tags) {
        Page page = pageService.getById(pageId);
        if (page == null) {
            throw WikiException.INVALID_PARAMETER.newException();
        }
        page.setTags(tags);
        pageService.updateById(page);
        log.info("Updated tags for page {}: {}", pageId, tags);
    }

    /**
     * Get all distinct tags used across pages in a space
     */
    public List<String> getSpaceTags(Long spaceId) {
        List<Page> pages = pageService.lambdaQuery()
                .eq(Page::getSpaceId, spaceId)
                .isNotNull(Page::getTags)
                .select(Page::getTags)
                .list();
        return pages.stream()
                .filter(p -> p.getTags() != null)
                .flatMap(p -> p.getTags().stream())
                .distinct()
                .sorted()
                .collect(Collectors.toList());
    }

}
