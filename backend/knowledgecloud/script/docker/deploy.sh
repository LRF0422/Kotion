#!/bin/bash

#====================================================================
# Knowledge Cloud Deployment Script
# Version: 2.0
# Features: Deploy, Rollback, Health Check, Logging, Multi-Environment
#====================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="/var/log/knowledge"
BACKUP_DIR="/opt/knowledge/backup"
COMPOSE_FILE="docker-compose.yml"

# Services definition
BASE_SERVICES="nacos sentinel web-nginx knowledge-nginx knowledge-redis"
CORE_SERVICES="knowledge-gateway1 knowledge-gateway2 knowledge-auth1 knowledge-auth2"
BUSINESS_SERVICES="knowledge-system knowledge-wiki knowledge-file-center knowledge-message knowledge-log"
OPS_SERVICES="knowledge-admin knowledge-swagger knowledge-resource knowledge-develop knowledge-report"
ALL_APP_SERVICES="${CORE_SERVICES} ${BUSINESS_SERVICES} ${OPS_SERVICES}"

# Logging function
log() {
    local level=$1
    shift
    local message="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case $level in
        INFO)  echo -e "${GREEN}[INFO]${NC} ${timestamp} - ${message}" ;;
        WARN)  echo -e "${YELLOW}[WARN]${NC} ${timestamp} - ${message}" ;;
        ERROR) echo -e "${RED}[ERROR]${NC} ${timestamp} - ${message}" ;;
        DEBUG) echo -e "${BLUE}[DEBUG]${NC} ${timestamp} - ${message}" ;;
    esac
    
    # Also write to log file
    mkdir -p ${LOG_DIR}
    echo "[${level}] ${timestamp} - ${message}" >> ${LOG_DIR}/deploy.log
}

# Usage information
usage() {
    echo -e "${BLUE}======================================${NC}"
    echo -e "${GREEN}Knowledge Cloud Deployment Tool v2.0${NC}"
    echo -e "${BLUE}======================================${NC}"
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  port              Open required firewall ports"
    echo "  mount             Initialize mount directories and files"
    echo "  base              Start base infrastructure services"
    echo "  modules           Start all application modules"
    echo "  start <service>   Start specific service(s)"
    echo "  stop [service]    Stop all or specific service(s)"
    echo "  restart [service] Restart all or specific service(s)"
    echo "  status            Show status of all services"
    echo "  logs <service>    Show logs for a service"
    echo "  health            Run health checks on all services"
    echo "  backup            Backup current deployment state"
    echo "  rollback          Rollback to previous deployment"
    echo "  cleanup           Clean up unused Docker resources"
    echo "  update <service>  Update specific service with latest image"
    echo "  scale <svc> <n>   Scale service to n instances"
    echo ""
    echo "Examples:"
    echo "  $0 base                    # Start infrastructure"
    echo "  $0 modules                 # Start all app services"
    echo "  $0 start knowledge-gateway # Start gateway only"
    echo "  $0 logs knowledge-auth1    # View auth service logs"
    echo "  $0 rollback                # Rollback to previous version"
    exit 1
}

# Open firewall ports
port() {
    log INFO "Opening firewall ports..."
    
    local ports=(88 8000 8848 9848 9849 8858 3306 3379 7002 9411 18000 
                 1889 8100 8106 7778 7004)
    
    for p in "${ports[@]}"; do
        firewall-cmd --add-port=${p}/tcp --permanent 2>/dev/null || true
    done
    
    firewall-cmd --reload 2>/dev/null || true
    log INFO "Firewall ports opened successfully"
}

# Initialize mount directories
mount() {
    log INFO "Initializing mount directories..."
    
    # Nginx API config
    if [[ ! -f "/docker/nginx/api/nginx.conf" ]]; then
        mkdir -p /docker/nginx/api
        cp ${SCRIPT_DIR}/nginx/api/nginx.conf /docker/nginx/api/nginx.conf
        log INFO "Nginx API config initialized"
    fi
    
    # Nginx Web config
    if [[ ! -f "/docker/nginx/web/nginx.conf" ]]; then
        mkdir -p /docker/nginx/web
        cp ${SCRIPT_DIR}/nginx/web/nginx.conf /docker/nginx/web/nginx.conf
        cp -r ${SCRIPT_DIR}/nginx/web/html /docker/nginx/web/html
        log INFO "Nginx Web config initialized"
    fi
    
    # Nacos config
    if [[ ! -f "/docker/nacos/init.d/custom.properties" ]]; then
        mkdir -p /docker/nacos/init.d
        cp ${SCRIPT_DIR}/nacos/init.d/custom.properties /docker/nacos/init.d/custom.properties
        log INFO "Nacos config initialized"
    fi
    
    # Create log and backup directories
    mkdir -p ${LOG_DIR} ${BACKUP_DIR}
    
    log INFO "Mount initialization completed"
}

# Start base infrastructure
base() {
    log INFO "Starting base infrastructure services..."
    cd ${SCRIPT_DIR}
    docker-compose up -d ${BASE_SERVICES}
    
    log INFO "Waiting for infrastructure to be ready..."
    wait_for_service "nacos" "http://localhost:8848/nacos" 60
    
    log INFO "Base infrastructure started successfully"
}

# Start application modules
modules() {
    log INFO "Starting application modules..."
    cd ${SCRIPT_DIR}
    
    # Start core services first
    log INFO "Starting core services..."
    docker-compose up -d ${CORE_SERVICES}
    sleep 10
    
    # Start business services
    log INFO "Starting business services..."
    docker-compose up -d ${BUSINESS_SERVICES}
    sleep 5
    
    # Start ops services
    log INFO "Starting ops services..."
    docker-compose up -d ${OPS_SERVICES}
    
    log INFO "All application modules started"
    health_check
}

# Start specific service(s)
start_service() {
    local services="$@"
    if [[ -z "$services" ]]; then
        log ERROR "Please specify service(s) to start"
        exit 1
    fi
    
    log INFO "Starting service(s): ${services}"
    cd ${SCRIPT_DIR}
    docker-compose up -d ${services}
    log INFO "Service(s) started"
}

# Stop services
stop_service() {
    local services="$@"
    cd ${SCRIPT_DIR}
    
    if [[ -z "$services" ]]; then
        log WARN "Stopping all services..."
        docker-compose stop
    else
        log INFO "Stopping service(s): ${services}"
        docker-compose stop ${services}
    fi
    log INFO "Service(s) stopped"
}

# Restart services
restart_service() {
    local services="$@"
    cd ${SCRIPT_DIR}
    
    if [[ -z "$services" ]]; then
        log INFO "Restarting all services..."
        docker-compose restart
    else
        log INFO "Restarting service(s): ${services}"
        docker-compose restart ${services}
    fi
    log INFO "Service(s) restarted"
}

# Show service status
status() {
    log INFO "Service Status:"
    echo ""
    cd ${SCRIPT_DIR}
    docker-compose ps
    echo ""
    
    log INFO "Container Health:"
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep knowledge || true
}

# Show service logs
show_logs() {
    local service=$1
    if [[ -z "$service" ]]; then
        log ERROR "Please specify a service name"
        exit 1
    fi
    
    cd ${SCRIPT_DIR}
    docker-compose logs -f --tail=100 ${service}
}

# Wait for a service to be ready
wait_for_service() {
    local name=$1
    local url=$2
    local timeout=${3:-30}
    local count=0
    
    log INFO "Waiting for ${name} to be ready..."
    
    while [[ $count -lt $timeout ]]; do
        if curl -s -o /dev/null -w "%{http_code}" "${url}" 2>/dev/null | grep -q "200\|302"; then
            log INFO "${name} is ready!"
            return 0
        fi
        sleep 2
        count=$((count + 2))
        echo -n "."
    done
    
    echo ""
    log WARN "${name} did not become ready within ${timeout}s"
    return 1
}

# Health check all services
health_check() {
    log INFO "Running health checks..."
    echo ""
    
    local services=(
        "Gateway:http://localhost:1889/actuator/health"
        "Auth:http://localhost:8100/actuator/health"
        "System:http://localhost:8106/actuator/health"
        "Wiki:http://localhost:7778/actuator/health"
        "Admin:http://localhost:7002/actuator/health"
        "Nacos:http://localhost:8848/nacos"
    )
    
    local all_healthy=true
    
    for svc in "${services[@]}"; do
        local name=$(echo $svc | cut -d: -f1)
        local url=$(echo $svc | cut -d: -f2-)
        
        if curl -s -o /dev/null -w "%{http_code}" "${url}" 2>/dev/null | grep -q "200\|302"; then
            echo -e "  ${GREEN}✓${NC} ${name}: healthy"
        else
            echo -e "  ${RED}✗${NC} ${name}: unhealthy"
            all_healthy=false
        fi
    done
    
    echo ""
    if $all_healthy; then
        log INFO "All services are healthy!"
    else
        log WARN "Some services are unhealthy"
    fi
}

# Backup current deployment
backup() {
    local backup_name="backup_$(date +%Y%m%d_%H%M%S)"
    local backup_path="${BACKUP_DIR}/${backup_name}"
    
    log INFO "Creating backup: ${backup_name}"
    mkdir -p ${backup_path}
    
    # Save current image tags
    cd ${SCRIPT_DIR}
    docker-compose config > ${backup_path}/docker-compose-resolved.yml
    cp .env ${backup_path}/.env 2>/dev/null || true
    
    # Save running container info
    docker ps --format "{{.Image}}" | grep knowledge > ${backup_path}/images.txt || true
    
    # Keep only last 5 backups
    ls -dt ${BACKUP_DIR}/backup_* | tail -n +6 | xargs rm -rf 2>/dev/null || true
    
    log INFO "Backup created at: ${backup_path}"
}

# Rollback to previous deployment
rollback() {
    local latest_backup=$(ls -dt ${BACKUP_DIR}/backup_* 2>/dev/null | head -1)
    
    if [[ -z "$latest_backup" ]]; then
        log ERROR "No backup found for rollback"
        exit 1
    fi
    
    log WARN "Rolling back to: ${latest_backup}"
    read -p "Are you sure? (y/N): " confirm
    
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        log INFO "Rollback cancelled"
        exit 0
    fi
    
    cd ${SCRIPT_DIR}
    
    # Restore .env if exists
    if [[ -f "${latest_backup}/.env" ]]; then
        cp ${latest_backup}/.env .env
    fi
    
    # Stop current services
    docker-compose down
    
    # Restart with previous config
    docker-compose up -d
    
    log INFO "Rollback completed"
    health_check
}

# Clean up Docker resources
cleanup() {
    log INFO "Cleaning up Docker resources..."
    
    # Remove dangling images
    docker images -f "dangling=true" -q | xargs docker rmi -f 2>/dev/null || true
    
    # Remove unused volumes
    docker volume prune -f 2>/dev/null || true
    
    # Remove unused networks
    docker network prune -f 2>/dev/null || true
    
    # Remove stopped containers
    docker container prune -f 2>/dev/null || true
    
    log INFO "Cleanup completed"
    docker system df
}

# Update specific service
update_service() {
    local service=$1
    if [[ -z "$service" ]]; then
        log ERROR "Please specify a service to update"
        exit 1
    fi
    
    log INFO "Updating service: ${service}"
    
    # Backup before update
    backup
    
    cd ${SCRIPT_DIR}
    
    # Pull latest image
    docker-compose pull ${service}
    
    # Recreate container
    docker-compose up -d --no-deps ${service}
    
    log INFO "Service ${service} updated"
    
    # Quick health check
    sleep 10
    health_check
}

# Scale service
scale_service() {
    local service=$1
    local replicas=$2
    
    if [[ -z "$service" || -z "$replicas" ]]; then
        log ERROR "Usage: scale <service> <replicas>"
        exit 1
    fi
    
    log INFO "Scaling ${service} to ${replicas} replicas"
    cd ${SCRIPT_DIR}
    docker-compose up -d --scale ${service}=${replicas}
    log INFO "Scaling completed"
}

# Main command handler
case "$1" in
    "port")
        port
        ;;
    "mount")
        mount
        ;;
    "base")
        base
        ;;
    "modules")
        modules
        ;;
    "start")
        shift
        start_service "$@"
        ;;
    "stop")
        shift
        stop_service "$@"
        ;;
    "restart")
        shift
        restart_service "$@"
        ;;
    "status")
        status
        ;;
    "logs")
        show_logs "$2"
        ;;
    "health")
        health_check
        ;;
    "backup")
        backup
        ;;
    "rollback")
        rollback
        ;;
    "cleanup")
        cleanup
        ;;
    "update")
        update_service "$2"
        ;;
    "scale")
        scale_service "$2" "$3"
        ;;
    *)
        usage
        ;;
esac
