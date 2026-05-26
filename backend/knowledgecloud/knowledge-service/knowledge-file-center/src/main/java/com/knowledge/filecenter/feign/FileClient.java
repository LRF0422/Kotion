package com.knowledge.filecenter.feign;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.knowledge.core.tool.api.R;
import com.knowledge.file.api.entity.dto.KnowledgeFileRepositoryDTO;
import com.knowledge.file.api.feign.IFileClient;
import com.knowledge.filecenter.application.FileApplication;

import cn.hutool.core.lang.tree.Tree;

@RestController
public class FileClient implements IFileClient {

    @Autowired
    private FileApplication fileApplication;

    @Override
    public R<?> createFileRepo(@RequestBody KnowledgeFileRepositoryDTO dto) {
        fileApplication.createFileRepository(dto);
        return R.success();
    }

    @Override
    public R<List<Tree<Long>>> repoFolderTree(@PathVariable("repoKey") String repoKey) {
        return R.data(fileApplication.folderTree(repoKey));
    }

}
