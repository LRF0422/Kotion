package com.knowledge.message.api.feign;

import com.knowledge.core.launch.constant.AppConstant;
import com.knowledge.core.tool.api.R;
import com.knowledge.message.api.dto.SendEmailDTO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

import java.util.List;

@FeignClient(AppConstant.APPLICATION_MESSAGE_NAME)
public interface IEmailClient {

    String API_PREFIX = "/mail";

    @PostMapping(API_PREFIX)
    R<?> sendEmail(@RequestBody SendEmailDTO dto);

    @PostMapping(API_PREFIX + "/batch")
    R<?> sendEmail(@RequestBody List<SendEmailDTO> dtos);
}
