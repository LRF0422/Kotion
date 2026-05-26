package com.knowledge.filecenter.converter;

import org.mapstruct.Mapper;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

import com.knowledge.core.common.base.IConverter;
import com.knowledge.file.api.entity.dto.KnowledgeFileDTO;
import com.knowledge.filecenter.entity.KnowledgeFile;
import com.knowledge.filecenter.entity.vo.KnowledgeFileVO;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface KnowledgeFileConverter extends IConverter<KnowledgeFile, KnowledgeFileDTO, KnowledgeFileVO> {

    KnowledgeFileConverter INSTANCE = Mappers.getMapper(KnowledgeFileConverter.class);

}
