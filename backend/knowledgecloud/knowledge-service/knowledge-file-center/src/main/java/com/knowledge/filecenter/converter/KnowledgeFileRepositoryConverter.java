package com.knowledge.filecenter.converter;

import org.mapstruct.Mapper;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

import com.knowledge.core.common.base.IConverter;
import com.knowledge.file.api.entity.dto.KnowledgeFileRepositoryDTO;
import com.knowledge.filecenter.entity.KnowledgeFileRepository;
import com.knowledge.filecenter.entity.vo.KnowledgeFileRepositoryVO;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface KnowledgeFileRepositoryConverter
        extends IConverter<KnowledgeFileRepository, KnowledgeFileRepositoryDTO, KnowledgeFileRepositoryVO> {

    KnowledgeFileRepositoryConverter INSTANCE = Mappers.getMapper(KnowledgeFileRepositoryConverter.class);

}
