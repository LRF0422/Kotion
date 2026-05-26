# Multi-stage build for smaller image
FROM maven:3.8-openjdk-8-slim AS builder
# Build stage is handled by Jenkins, this is just for reference

# Runtime stage
FROM eclipse-temurin:8-jre-alpine

LABEL maintainer="knowledge-team" \
      version="3.4.1" \
      description="Knowledge Gateway Service"

# Create non-root user for security
RUN addgroup -S knowledge && adduser -S knowledge -G knowledge

# Create app directory
RUN mkdir -p /knowledge/gateway && chown -R knowledge:knowledge /knowledge

WORKDIR /knowledge/gateway

# Copy jar file
COPY --chown=knowledge:knowledge ./target/knowledge-gateway.jar ./app.jar

# Switch to non-root user
USER knowledge

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget -q --spider http://localhost:80/actuator/health || exit 1

# JVM optimization for containers
ENV JAVA_OPTS="-XX:+UseContainerSupport \
    -XX:MaxRAMPercentage=75.0 \
    -XX:InitialRAMPercentage=50.0 \
    -XX:+UseG1GC \
    -XX:+HeapDumpOnOutOfMemoryError \
    -XX:HeapDumpPath=/knowledge/gateway/logs \
    -Djava.security.egd=file:/dev/./urandom"

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]

CMD ["--spring.profiles.active=test"]
