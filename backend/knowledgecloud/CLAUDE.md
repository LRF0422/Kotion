# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Knowledge Cloud is a Java-based knowledge management system with AI Agent capabilities, built on Spring Cloud microservices architecture.

## Build Commands

```bash
# Build all modules
make build
# or: mvn clean package

# Build without tests (faster)
make build-fast
# or: mvn clean package -DskipTests

# Build specific module
make build-module MODULE=knowledge-gateway

# Run all tests
make test
# or: mvn test

# Run tests for specific module
make test-module MODULE=knowledge-gateway

# Clean build artifacts
make clean
# or: mvn clean
```

## Service Ports

| Service      | Port |
|--------------|------|
| gateway      | 1889 |
| auth         | 8100 |
| system       | 8106 |
| wiki         | 7778 |
| file-center  | 7004 |
| resource     | 8010 |
| widget-hub   | 6667 |

## Architecture

### Module Structure

- **knowledge-gateway**: API Gateway (Spring Cloud Gateway)
- **knowledge-auth**: Authentication service
- **knowledge-service**: Core business services
  - `knowledge-agent-skills`: AI Agent with skills (DeepSeek integration, annotation-driven skills/tools)
  - `knowledge-system`: System management
  - `knowledge-wiki`: Wiki knowledge management
  - `knowledge-file-center`: File management
  - `knowledge-message`: Messaging
  - `knowledge-log`: Logging
- **knowledge-service-api**: API definitions (interfaces, DTOs, enums)
  - `knowledge-agent-api`: AI Agent API (ModelProvider, ChatClientFactory, annotations)
- **knowledge-tool**: Core frameworks and utilities
  - `knowledge-core-agent`: Agent core framework
  - `knowledge-core-boot`: Spring Boot extensions
  - `knowledge-core-common`: Common utilities
  - `knowledge-core-mybatis`: MyBatis extensions
  - `knowledge-core-secure`: Security utilities
  - Other core modules (feign, loadbalancer, oss, permission, etc.)
- **knowledge-ops**: Operations services (admin, swagger, resource, develop, report)
- **knowledge-common**: Shared common code

### Key Patterns

- **Annotation-driven Skills**: Use `@Skill`, `@Tool`, `@SkillMethod` annotations in `knowledge-agent-api`
- **ModelProvider Abstraction**: `ModelProvider` interface in `knowledge-agent-api` for LLM provider integration
- **SkillExecutor Interface**: Runtime interface for executing skills (renamed from `Skill` to avoid confusion)
- **AgentTeams**: Support for multi-agent orchestration with roles (SPECIALIST, COORDINATOR, RESEARCHER, ANALYZER, REPORTER)
- **Session Persistence**: Agent message and tool call storage via `AgentMessageEntity`, `AgentToolCallEntity`

### Technology Stack

- Java 1.8
- Spring Boot 2.7.1
- Spring Cloud 2021.0.3
- MyBatis
- Nacos (service discovery/config)
- MapStruct (bean mapping)
- Lombok

### Important Notes

- MapStruct annotation processor is configured - rebuild after adding/changing mappers
- Use `mvn clean package` when MapStruct changes don't reflect
