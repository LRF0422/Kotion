package com.knowledge.system.converter;

import com.knowledge.system.domain.Tenant;
import com.knowledge.system.domain.dto.TenantDTO;
import com.knowledge.system.vo.TenantVO;
import org.mapstruct.Mapper;
import org.mapstruct.factory.Mappers;

import java.util.List;

@Mapper
public interface TenantConverter {

	TenantConverter INSTANCE = Mappers.getMapper(TenantConverter.class);

	TenantVO converter(Tenant tenant);

	List<TenantVO> converter(List<Tenant> tenants);

	Tenant convert(TenantDTO dto);
}
