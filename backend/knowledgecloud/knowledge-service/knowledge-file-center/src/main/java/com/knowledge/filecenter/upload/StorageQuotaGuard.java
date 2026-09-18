package com.knowledge.filecenter.upload;

import com.knowledge.core.entitlement.EntitlementGate;
import com.knowledge.core.entitlement.constant.EntitlementCodes;
import com.knowledge.filecenter.mapper.FileMapper;
import com.knowledge.filecenter.mapper.UploadSessionMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 文件写入唯一的额度关口：单文件上限 + 拥有者存储总量。
 *
 * <p>所有新增文件路径（上传完成、复制、下载落盘）最终都经 `FileServiceImpl.createOrSaveFile`，
 * 由本类统一校验；用 `knowledge_upload_owner_lock` 行锁串行化同一拥有者的并发写入，
 * 避免两个并发上传同时通过额度检查造成超卖。</p>
 *
 * @author Kotion
 */
@Component
@RequiredArgsConstructor
public class StorageQuotaGuard {

    private final EntitlementGate entitlementGate;
    private final FileMapper fileMapper;
    private final UploadSessionMapper uploadSessionMapper;

    @Transactional(rollbackFor = Exception.class)
    public void check(Long userId, String tenantId, long incomingSize) {
        if (userId == null || incomingSize <= 0) {
            return;
        }
        entitlementGate.requireQuota(userId, EntitlementCodes.FILE_MAX_SIZE, 0L, incomingSize,
                "单文件大小超出当前套餐上限");
        if (tenantId == null) {
            return;
        }
        uploadSessionMapper.ensureOwnerQuotaLock(tenantId, userId);
        uploadSessionMapper.lockOwnerForUploadQuota(tenantId, userId);
        long used = fileMapper.sumActiveSize(tenantId, userId);
        entitlementGate.requireQuota(userId, EntitlementCodes.STORAGE_BYTES, used, incomingSize,
                "存储空间不足，请升级套餐后重试");
    }
}
