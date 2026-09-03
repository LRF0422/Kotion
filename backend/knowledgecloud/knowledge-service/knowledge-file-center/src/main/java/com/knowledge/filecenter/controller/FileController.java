package com.knowledge.filecenter.controller;

import java.util.List;

import javax.validation.Valid;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.knowledge.core.tool.api.R;
import com.knowledge.file.api.entity.dto.KnowledgeFileDTO;
import com.knowledge.file.api.entity.dto.MoveFileDTO;
import com.knowledge.file.api.entity.dto.QueryFileDTO;
import com.knowledge.file.api.entity.dto.RenameFileDTO;
import com.knowledge.filecenter.application.FileApplication;
import com.knowledge.filecenter.application.UploadSessionApplication;
import com.knowledge.filecenter.entity.dto.upload.AbortUploadSessionRequest;
import com.knowledge.filecenter.entity.dto.upload.CompleteUploadSessionRequest;
import com.knowledge.filecenter.entity.dto.upload.CreateUploadSessionRequest;
import com.knowledge.filecenter.entity.dto.upload.SignUploadPartsRequest;
import com.knowledge.filecenter.entity.dto.upload.UploadPartAcknowledgementRequest;
import com.knowledge.filecenter.entity.vo.KnowledgeFileVO;
import com.knowledge.filecenter.entity.vo.upload.SignedUploadPartVO;
import com.knowledge.filecenter.entity.vo.upload.UploadCapabilitiesVO;
import com.knowledge.filecenter.entity.vo.upload.UploadPartVO;
import com.knowledge.filecenter.entity.vo.upload.UploadSessionVO;

import cn.hutool.core.lang.tree.Tree;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import io.swagger.annotations.ApiParam;

import javax.servlet.http.HttpServletResponse;

@RestController
@Api(value = "File Management", tags = "File Management API")
public class FileController {

    @Autowired
    private FileApplication fileApplication;
    @Autowired
    private UploadSessionApplication uploadSessionApplication;

    @GetMapping("/file/upload-capabilities")
    @ApiOperation("Get resumable upload capabilities")
    public R<UploadCapabilitiesVO> uploadCapabilities() {
        return R.data(uploadSessionApplication.capabilities());
    }

    @PostMapping("/file/upload-sessions")
    @ApiOperation("Create or resume an idempotent upload session")
    public R<UploadSessionVO> createUploadSession(@Valid @RequestBody CreateUploadSessionRequest request) {
        return R.data(uploadSessionApplication.create(request));
    }

    @PostMapping("/file/upload-sessions/{id}/parts/sign")
    @ApiOperation("Create just-in-time upload targets for parts")
    public R<List<SignedUploadPartVO>> signUploadParts(
            @PathVariable("id") Long id,
            @Valid @RequestBody SignUploadPartsRequest request) {
        return R.data(uploadSessionApplication.signParts(id, request));
    }

    @PutMapping("/file/upload-sessions/{id}/parts/{partNumber}")
    @ApiOperation("Acknowledge an uploaded part")
    public R<UploadPartVO> acknowledgeUploadPart(
            @PathVariable("id") Long id,
            @PathVariable("partNumber") Integer partNumber,
            @Valid @RequestBody UploadPartAcknowledgementRequest request) {
        return R.data(uploadSessionApplication.acknowledgePart(id, partNumber, request));
    }

    @PostMapping("/file/upload-sessions/{id}/reconcile")
    @ApiOperation("Reconcile uploaded parts with the storage provider")
    public R<UploadSessionVO> reconcileUploadSession(@PathVariable("id") Long id) {
        return R.data(uploadSessionApplication.reconcile(id));
    }

    @PostMapping("/file/upload-sessions/{id}/complete")
    @ApiOperation("Complete a resumable upload")
    public R<UploadSessionVO> completeUploadSession(
            @PathVariable("id") Long id,
            @Valid @RequestBody(required = false) CompleteUploadSessionRequest request) {
        return R.data(uploadSessionApplication.complete(id, request));
    }

    @PostMapping("/file/upload-sessions/{id}/abort")
    @ApiOperation("Abort a resumable upload")
    public R<UploadSessionVO> abortUploadSession(
            @PathVariable("id") Long id,
            @Valid @RequestBody(required = false) AbortUploadSessionRequest request) {
        return R.data(uploadSessionApplication.abort(id, request));
    }

    @GetMapping("/file/upload-sessions/{id}")
    @ApiOperation("Get resumable upload status")
    public R<UploadSessionVO> getUploadSession(@PathVariable("id") Long id) {
        return R.data(uploadSessionApplication.get(id));
    }

    @GetMapping("/file/upload-sessions")
    @ApiOperation("List active resumable uploads owned by the current user")
    public R<List<UploadSessionVO>> activeUploadSessions() {
        return R.data(uploadSessionApplication.active());
    }

    @PostMapping("/file")
    @ApiOperation("Create file or folder")
    public R<?> createFile(@RequestBody KnowledgeFileDTO dto) {
        fileApplication.createFile(dto);
        return R.success();
    }

    @PostMapping("/file/upload")
    @ApiOperation("Upload file")
    public R<KnowledgeFileVO> uploadFile(
            @ApiParam("File to upload") @RequestParam("file") MultipartFile file,
            @ApiParam("Parent folder ID") @RequestParam(value = "parentId", required = false) Long parentId,
            @ApiParam("Repository key") @RequestParam(value = "repositoryKey", required = false) String repositoryKey) {
        KnowledgeFileVO fileVO = fileApplication.uploadFile(file, parentId, repositoryKey);
        return R.data(fileVO);
    }

    @PostMapping("/file/batch-upload")
    @ApiOperation("Batch upload files")
    public R<List<KnowledgeFileVO>> batchUploadFiles(
            @ApiParam("Files to upload") @RequestParam("files") MultipartFile[] files,
            @ApiParam("Parent folder ID") @RequestParam(value = "parentId", required = false) Long parentId,
            @ApiParam("Repository key") @RequestParam(value = "repositoryKey", required = false) String repositoryKey) {
        List<KnowledgeFileVO> fileVOs = fileApplication.batchUploadFiles(files, parentId, repositoryKey);
        return R.data(fileVOs);
    }

    @GetMapping("/file/{fileId}/download")
    @ApiOperation("Download file")
    public void downloadFile(
            @ApiParam("File ID") @PathVariable("fileId") Long fileId,
            HttpServletResponse response) {
        fileApplication.downloadFile(fileId, response);
    }

    @PutMapping("/file/{fileId}")
    @ApiOperation("Update file metadata")
    public R<?> updateFile(
            @ApiParam("File ID") @PathVariable("fileId") Long fileId,
            @RequestBody KnowledgeFileDTO dto) {
        dto.setId(fileId);
        fileApplication.updateFile(dto);
        return R.success();
    }

    @PutMapping("/file/{fileId}/rename")
    @ApiOperation("Rename file or folder")
    public R<?> renameFile(
            @ApiParam("File ID") @PathVariable("fileId") Long fileId,
            @RequestBody RenameFileDTO dto) {
        fileApplication.renameFile(fileId, dto.getNewName());
        return R.success();
    }

    @PutMapping("/file/move")
    @ApiOperation("Move file or folder")
    public R<?> moveFile(@RequestBody MoveFileDTO dto) {
        fileApplication.moveFile(dto);
        return R.success();
    }

    @PostMapping("/file/{fileId}/copy")
    @ApiOperation("Copy file or folder")
    public R<KnowledgeFileVO> copyFile(
            @ApiParam("File ID") @PathVariable("fileId") Long fileId,
            @ApiParam("Target folder ID") @RequestParam(value = "targetParentId", required = false) Long targetParentId) {
        return R.data(fileApplication.copyFile(fileId, targetParentId));
    }

    @DeleteMapping("/file/{fileId}")
    @ApiOperation("Delete file or folder (move to trash)")
    public R<?> deleteFile(@ApiParam("File ID") @PathVariable("fileId") Long fileId) {
        fileApplication.deleteFile(fileId);
        return R.success();
    }

    @DeleteMapping("/file/batch")
    @ApiOperation("Batch delete files (move to trash)")
    public R<?> batchDeleteFiles(@ApiParam("File IDs") @RequestParam("fileIds") List<Long> fileIds) {
        fileApplication.batchDeleteFiles(fileIds);
        return R.success();
    }

    // ===== 回收站 =====

    @PutMapping("/file/{fileId}/trash")
    @ApiOperation("Move file or folder to trash")
    public R<?> trashFile(@ApiParam("File ID") @PathVariable("fileId") Long fileId) {
        fileApplication.deleteFile(fileId);
        return R.success();
    }

    @PutMapping("/file/{fileId}/restore")
    @ApiOperation("Restore file or folder from trash")
    public R<?> restoreFile(@ApiParam("File ID") @PathVariable("fileId") Long fileId) {
        fileApplication.restore(fileId);
        return R.success();
    }

    @GetMapping("/trash")
    @ApiOperation("List trashed files")
    public R<List<KnowledgeFileVO>> listTrash() {
        return R.data(fileApplication.listTrash());
    }

    @DeleteMapping("/file/{fileId}/purge")
    @ApiOperation("Permanently delete file or folder")
    public R<?> purgeFile(@ApiParam("File ID") @PathVariable("fileId") Long fileId) {
        fileApplication.purge(fileId);
        return R.success();
    }

    @DeleteMapping("/trash")
    @ApiOperation("Empty trash (permanently delete all trashed files)")
    public R<?> emptyTrash() {
        fileApplication.emptyTrash();
        return R.success();
    }

    // ===== 收藏 / 最近访问 =====

    @PostMapping("/file/{fileId}/favorite")
    @ApiOperation("Toggle favorite")
    public R<?> toggleFavorite(
            @ApiParam("File ID") @PathVariable("fileId") Long fileId,
            @ApiParam("Favorite flag") @RequestParam("favorite") boolean favorite) {
        fileApplication.toggleFavorite(fileId, favorite);
        return R.success();
    }

    @GetMapping("/favorites")
    @ApiOperation("List favorite files")
    public R<List<KnowledgeFileVO>> listFavorites() {
        return R.data(fileApplication.listFavorites());
    }

    @GetMapping("/recent")
    @ApiOperation("List recently accessed files")
    public R<List<KnowledgeFileVO>> listRecent(
            @ApiParam("Limit") @RequestParam(value = "limit", required = false, defaultValue = "20") Integer limit) {
        return R.data(fileApplication.listRecent(limit));
    }

    @GetMapping("/repo/{repoKey}/folder/tree")
    @ApiOperation("Get repository folder tree")
    public R<List<Tree<Long>>> repoFolderTree(@PathVariable("repoKey") String repoKey) {
        return R.data(fileApplication.folderTree(repoKey));
    }

    @GetMapping("/folder/root")
    @ApiOperation("Get root folder tree")
    public R<List<Tree<Long>>> getRootFolder() {
        return R.data(fileApplication.getRootFolder());
    }

    @GetMapping("/folder/children")
    @ApiOperation("Get folder children")
    public R<List<KnowledgeFileVO>> getChildren(QueryFileDTO dto) {
        return R.data(fileApplication.getChildren(dto));
    }

    @GetMapping("/folder/children/page")
    @ApiOperation("Get folder children with pagination")
    public R<IPage<KnowledgeFileVO>> getChildrenPage(QueryFileDTO dto) {
        return R.data(fileApplication.getChildrenPage(dto));
    }

    @GetMapping("/file/{fileId}")
    @ApiOperation("Get file by ID")
    public R<KnowledgeFileVO> getById(@PathVariable("fileId") Long fileId) {
        return R.data(fileApplication.getById(fileId));
    }

    @GetMapping("/file/search")
    @ApiOperation("Search files")
    public R<List<KnowledgeFileVO>> searchFiles(
            @ApiParam("Search keyword") @RequestParam("keyword") String keyword,
            @ApiParam("Repository key") @RequestParam(value = "repositoryKey", required = false) String repositoryKey) {
        return R.data(fileApplication.searchFiles(keyword, repositoryKey));
    }

}
