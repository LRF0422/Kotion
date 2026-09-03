package com.knowledge.filecenter.upload;

import java.time.Duration;

import javax.annotation.PostConstruct;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import lombok.Data;

@Data
@Component
@ConfigurationProperties(prefix = "file.upload")
public class UploadSessionProperties {

    private Duration inactivityTimeout = Duration.ofHours(24);
    private Duration maxLifetime = Duration.ofDays(7);
    private Duration targetExpiry = Duration.ofMinutes(15);
    private boolean cleanupEnabled = false;
    private boolean reconcileEnabled = false;
    private Duration reconcileAfter = Duration.ofMinutes(30);
    private Duration operationLease = Duration.ofMinutes(5);
    private int cleanupBatchSize = 50;
    private int maxActiveSessionsPerOwner = 20;

    @PostConstruct
    public void validate() {
        if (!positive(inactivityTimeout) || !positive(maxLifetime) || !positive(targetExpiry)
                || !positive(reconcileAfter) || !positive(operationLease)
                || inactivityTimeout.compareTo(maxLifetime) > 0
                || cleanupBatchSize < 1 || cleanupBatchSize > 500
                || maxActiveSessionsPerOwner < 1 || maxActiveSessionsPerOwner > 1000) {
            throw new IllegalStateException("Invalid resumable upload configuration");
        }
    }

    private boolean positive(Duration duration) {
        return duration != null && !duration.isZero() && !duration.isNegative();
    }
}
