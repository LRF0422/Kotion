package com.knowledge.filecenter.controller;

import java.util.List;

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

import com.knowledge.core.tool.api.R;
import com.knowledge.file.api.entity.dto.KnowledgeFileDTO;
import com.knowledge.file.api.entity.dto.MoveFileDTO;
import com.knowledge.file.api.entity.dto.QueryFileDTO;
import com.knowledge.filecenter.application.FileApplication;
import com.knowledge.filecenter.entity.vo.KnowledgeFileVO;

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
            @ApiParam("New name") @RequestParam("newName") String newName) {
        fileApplication.renameFile(fileId, newName);
        return R.success();
    }

    @PutMapping("/file/move")
    @ApiOperation("Move file or folder")
    public R<?> moveFile(@RequestBody MoveFileDTO dto) {
        fileApplication.moveFile(dto);
        return R.success();
    }

    @DeleteMapping("/file/{fileId}")
    @ApiOperation("Delete file or folder")
    public R<?> deleteFile(@ApiParam("File ID") @PathVariable("fileId") Long fileId) {
        fileApplication.deleteFile(fileId);
        return R.success();
    }

    @DeleteMapping("/file/batch")
    @ApiOperation("Batch delete files")
    public R<?> batchDeleteFiles(@ApiParam("File IDs") @RequestParam("fileIds") List<Long> fileIds) {
        fileApplication.batchDeleteFiles(fileIds);
        return R.success();
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
    @ApiOperation("Get folder children with pagination")
    public R<List<KnowledgeFileVO>> getChildren(QueryFileDTO dto) {
        return R.data(fileApplication.getChildren(dto));
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
