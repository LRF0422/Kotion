package com.knowledge.system.converter;

import com.knowledge.system.domain.Dept;
import com.knowledge.system.vo.DeptVO;
import org.mapstruct.Mapper;
import org.mapstruct.factory.Mappers;

@Mapper
public interface DeptConverter {

	DeptConverter INSTANCE = Mappers.getMapper(DeptConverter.class);

	DeptVO converter(Dept dept);
}
