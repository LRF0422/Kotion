package com.knowledge.file.api.feign;

import java.util.List;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

import com.knowledge.core.launch.constant.AppConstant;
import com.knowledge.core.tool.api.R;
import com.knowledge.file.api.entity.dto.KnowledgeFileRepositoryDTO;

import cn.hutool.core.lang.tree.Tree;

@FeignClient(AppConstant.APPLICATION_FILE_CENTER_NAME)
public interface IFileClient {

    @PostMapping("/cmd/file-repo")
    R<?> createFileRepo(@RequestBody KnowledgeFileRepositoryDTO dto);

    @GetMapping("/cmd/{repoKey}/folder/tree")
    R<List<Tree<Long>>> repoFolderTree(@PathVariable("repoKey") String repoKey);

}
