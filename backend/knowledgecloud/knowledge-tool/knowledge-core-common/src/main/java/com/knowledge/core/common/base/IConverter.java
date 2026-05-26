package com.knowledge.core.common.base;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;

import java.util.List;

import org.mapstruct.MappingTarget;

public interface IConverter<DO, DTO, VO> {

	DO convertDO(DTO dto);

	List<DO> convertDO(List<DTO> dtos);

	VO convertVO(DO entity);

	List<VO> convertVO(List<DO> entities);

	Page<VO> convertVO(IPage<DO> page);

	DO update(DO entity, @MappingTarget DO target);
}
