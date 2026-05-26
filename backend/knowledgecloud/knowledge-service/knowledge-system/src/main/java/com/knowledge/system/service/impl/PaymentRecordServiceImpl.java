package com.knowledge.system.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.knowledge.system.domain.PaymentRecord;
import com.knowledge.system.mapper.PaymentRecordMapper;
import com.knowledge.system.service.IPaymentRecordService;
import org.springframework.stereotype.Service;

/**
 * 支付记录服务实现类
 *
 * @author Qwen
 */
@Service
public class PaymentRecordServiceImpl extends ServiceImpl<PaymentRecordMapper, PaymentRecord>
        implements IPaymentRecordService {

}