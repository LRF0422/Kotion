# Knowledge Cloud Makefile
# ========================
# Simplifies common development and deployment tasks

.PHONY: help build test clean docker-build docker-push deploy-dev deploy-test deploy-prod

# Default target
help:
	@echo "Knowledge Cloud Build System"
	@echo "============================"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Build Targets:"
	@echo "  build          - Build all modules"
	@echo "  build-fast     - Build without tests"
	@echo "  build-module   - Build specific module (MODULE=xxx)"
	@echo "  clean          - Clean all build artifacts"
	@echo "  test           - Run all tests"
	@echo "  test-module    - Run tests for specific module"
	@echo ""
	@echo "Docker Targets:"
	@echo "  docker-build   - Build all Docker images"
	@echo "  docker-push    - Push images to registry"
	@echo "  docker-clean   - Remove local images"
	@echo ""
	@echo "Deployment Targets:"
	@echo "  deploy-dev     - Deploy to development"
	@echo "  deploy-test    - Deploy to test"
	@echo "  deploy-prod    - Deploy to production"
	@echo ""
	@echo "Local Development:"
	@echo "  start-infra    - Start local infrastructure"
	@echo "  stop-infra     - Stop local infrastructure"
	@echo "  logs           - View service logs (SVC=xxx)"
	@echo ""
	@echo "Examples:"
	@echo "  make build-fast"
	@echo "  make build-module MODULE=knowledge-gateway"
	@echo "  make deploy-dev"

# Configuration
VERSION := 3.4.1
DOCKER_REGISTRY := 192.168.3.43:5000
IMAGE_PREFIX := knowledge
MAVEN_OPTS := -T 4C -q

# Build all modules
build:
	mvn clean package $(MAVEN_OPTS)

# Build without tests
build-fast:
	mvn clean package -DskipTests $(MAVEN_OPTS)

# Build specific module
build-module:
ifndef MODULE
	$(error MODULE is required. Usage: make build-module MODULE=knowledge-gateway)
endif
	mvn clean package -pl $(MODULE) -am -DskipTests $(MAVEN_OPTS)

# Clean build artifacts
clean:
	mvn clean
	find . -name "*.jar" -path "*/target/*" -delete

# Run all tests
test:
	mvn test $(MAVEN_OPTS)

# Run tests for specific module
test-module:
ifndef MODULE
	$(error MODULE is required. Usage: make test-module MODULE=knowledge-gateway)
endif
	mvn test -pl $(MODULE) -am $(MAVEN_OPTS)

# Build Docker images
docker-build: build-fast
	@echo "Building Docker images..."
	@for svc in knowledge-gateway knowledge-auth; do \
		echo "Building $$svc..."; \
		cd $$svc && docker build -t $(DOCKER_REGISTRY)/$(IMAGE_PREFIX)/$$svc:$(VERSION) . && cd ..; \
	done
	@for svc in knowledge-system knowledge-wiki knowledge-file-center knowledge-message knowledge-log; do \
		echo "Building $$svc..."; \
		cd knowledge-service/$$svc && docker build -t $(DOCKER_REGISTRY)/$(IMAGE_PREFIX)/$$svc:$(VERSION) . && cd ../..; \
	done
	@for svc in knowledge-admin knowledge-swagger knowledge-resource knowledge-develop knowledge-report; do \
		echo "Building $$svc..."; \
		cd knowledge-ops/$$svc && docker build -t $(DOCKER_REGISTRY)/$(IMAGE_PREFIX)/$$svc:$(VERSION) . && cd ../..; \
	done
	@echo "Docker images built successfully!"

# Push images to registry
docker-push:
	@echo "Pushing Docker images to $(DOCKER_REGISTRY)..."
	@docker images | grep $(DOCKER_REGISTRY)/$(IMAGE_PREFIX) | awk '{print $$1":"$$2}' | xargs -I {} docker push {}
	@echo "Images pushed successfully!"

# Clean Docker images
docker-clean:
	@echo "Removing local Docker images..."
	@docker images | grep $(IMAGE_PREFIX) | awk '{print $$3}' | xargs -r docker rmi -f
	@docker system prune -f

# Deploy to development
deploy-dev:
	@echo "Deploying to development environment..."
	cd script/docker && ./deploy.sh base
	cd script/docker && ./deploy.sh modules
	cd script/docker && ./deploy.sh health

# Deploy to test
deploy-test:
	@echo "Deploying to test environment..."
	@echo "TODO: Implement remote deployment"

# Deploy to production
deploy-prod:
	@echo "Deploying to production environment..."
	@read -p "Are you sure you want to deploy to PRODUCTION? (yes/no): " confirm; \
	if [ "$$confirm" = "yes" ]; then \
		echo "TODO: Implement production deployment"; \
	else \
		echo "Deployment cancelled."; \
	fi

# Start local infrastructure
start-infra:
	cd script/docker && docker-compose up -d nacos knowledge-redis
	@echo "Waiting for services to be ready..."
	@sleep 10
	@echo "Infrastructure started!"

# Stop local infrastructure
stop-infra:
	cd script/docker && docker-compose down

# View service logs
logs:
ifndef SVC
	cd script/docker && docker-compose logs -f --tail=100
else
	cd script/docker && docker-compose logs -f --tail=100 $(SVC)
endif

# Check service status
status:
	cd script/docker && docker-compose ps
	@echo ""
	@echo "Health Status:"
	@cd script/docker && ./deploy.sh health

# Format code
format:
	mvn spotless:apply || true

# Code quality check
sonar:
	mvn sonar:sonar -Dsonar.host.url=http://14.29.235.4:9000

# Generate API docs
docs:
	mvn javadoc:aggregate -DskipTests

# Version info
version:
	@echo "Knowledge Cloud Version: $(VERSION)"
	@echo "Java Version: $$(java -version 2>&1 | head -1)"
	@echo "Maven Version: $$(mvn -version 2>&1 | head -1)"
	@echo "Docker Version: $$(docker --version)"
