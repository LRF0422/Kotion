#!/usr/bin/env bash
#
# Knowledge Cloud 后端单模块 Docker 镜像构建脚本
# ==============================================
# 使用各模块 pom 中声明的 Maven Docker 插件
# （com.spotify:docker-maven-plugin，goal: docker:build / docker:push）
# 单独为指定模块构建镜像；可只对含 Dockerfile 的服务模块操作。
#
# 流程（每个模块）:
#   1) mvn -pl <module> -am package -DskipTests   # 先产出可执行 jar
#   2) mvn -pl <module> docker:build              # 用 Maven 插件构建镜像
#      （--push 时追加 docker:push）
#
# 用法:
#   bash scripts/build-backend-docker.sh                    # 交互式选择
#   bash scripts/build-backend-docker.sh knowledge-wiki     # 按模块名
#   bash scripts/build-backend-docker.sh 3                  # 按 --list 中的编号
#   bash scripts/build-backend-docker.sh knowledge-wiki --push
#   bash scripts/build-backend-docker.sh all                # 全部可构建镜像的模块
#
# 选项:
#   -l, --list            只列出可构建镜像的模块后退出
#       --push            构建后执行 docker:push 推送到镜像仓库
#       --no-build        跳过第 1 步（假设 jar 已存在）
#       --clean           第 1 步前先执行 mvn clean
#   -o, --offline         Maven 离线模式 (-o)
#   -T, --parallel        第 1 步并行构建 (-T 1C)
#       --registry HOST   覆盖镜像仓库地址（默认取 pom 的 docker.registry.host）
#       --docker-host URL 覆盖 Docker 守护进程地址（默认取 pom 的 docker.host，
#                         或环境变量 DOCKER_HOST）
#   -n, --dry-run         只打印将执行的 Maven 命令，不真正执行
#   -h, --help            显示本帮助
#   -- <args...>          -- 之后的参数原样透传给 docker:build/docker:push
#
# 环境变量:
#   JAVA_HOME         指定使用的 JDK（默认优先使用仓库内 .toolchain/jdk-*）
#   BACKEND_DIR       后端工程根目录（默认 <repo>/backend/knowledgecloud）
#   MAVEN_BIN         指定 mvn 可执行文件
#   DOCKER_HOST       未显式 --docker-host 时作为 Docker 守护进程地址
#
# 示例:
#   bash scripts/build-backend-docker.sh --list
#   bash scripts/build-backend-docker.sh knowledge-wiki
#   bash scripts/build-backend-docker.sh knowledge-agent-skills --docker-host unix:///var/run/docker.sock
#   bash scripts/build-backend-docker.sh knowledge-system --registry 10.0.0.5:5000 --push
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/backend-common.sh"

# ---------- 只保留含 Dockerfile 的模块 ----------
DOCKER_PATHS=(); DOCKER_IDS=(); DOCKER_PKGS=()
for di in "${!MOD_PATHS[@]}"; do
  if [ -f "${BACKEND_DIR}/${MOD_PATHS[$di]}/Dockerfile" ]; then
    DOCKER_PATHS+=("${MOD_PATHS[$di]}")
    DOCKER_IDS+=("${MOD_IDS[$di]}")
    DOCKER_PKGS+=("${MOD_PKGS[$di]}")
  fi
done
MOD_PATHS=("${DOCKER_PATHS[@]:-}")
MOD_IDS=("${DOCKER_IDS[@]:-}")
MOD_PKGS=("${DOCKER_PKGS[@]:-}")

if [ "${#DOCKER_PATHS[@]}" -eq 0 ]; then
  echo "错误: 未发现任何含 Dockerfile 的模块。" >&2
  exit 1
fi

# ---------- 默认参数 ----------
LIST_ONLY=0
DO_PUSH=0
DO_BUILD=1
DO_CLEAN=0
OFFLINE=0
PARALLEL=0
DRY_RUN=0
REGISTRY=""
DOCKER_HOST_ARG=""
EXTRA_ARGS=()

usage() {
  cat <<'USAGE'
Knowledge Cloud 后端单模块 Docker 镜像构建脚本

用法:
  bash scripts/build-backend-docker.sh                    # 交互式选择
  bash scripts/build-backend-docker.sh knowledge-wiki     # 按模块名
  bash scripts/build-backend-docker.sh 3                  # 按 --list 中的编号
  bash scripts/build-backend-docker.sh all                # 全部可构建镜像的模块

选项:
  -l, --list            只列出可构建镜像的模块后退出
      --push            构建后执行 docker:push 推送到镜像仓库
      --no-build        跳过 jar 构建步骤
      --clean           构建 jar 前先 mvn clean
  -o, --offline         Maven 离线模式
  -T, --parallel        jar 构建并行 (-T 1C)
      --registry HOST   覆盖镜像仓库地址
      --docker-host URL 覆盖 Docker 守护进程地址
  -n, --dry-run         只打印 Maven 命令
  -h, --help            显示本帮助
  -- <args...>          透传给 docker:build / docker:push

示例:
  bash scripts/build-backend-docker.sh knowledge-wiki
  bash scripts/build-backend-docker.sh knowledge-wiki --docker-host unix:///var/run/docker.sock
  bash scripts/build-backend-docker.sh knowledge-system --registry 10.0.0.5:5000 --push
USAGE
}

# ---------- 解析命令行 ----------
while [ $# -gt 0 ]; do
  case "$1" in
    -l|--list)      LIST_ONLY=1 ;;
    --push)         DO_PUSH=1 ;;
    --no-build)     DO_BUILD=0 ;;
    --clean)        DO_CLEAN=1 ;;
    -o|--offline)   OFFLINE=1 ;;
    -T|--parallel)  PARALLEL=1 ;;
    --registry)     shift; REGISTRY="${1:-}" ;;
    --docker-host)  shift; DOCKER_HOST_ARG="${1:-}" ;;
    -n|--dry-run)   DRY_RUN=1 ;;
    -h|--help)      usage; exit 0 ;;
    --)             shift; EXTRA_ARGS+=("$@"); break ;;
    -*)             echo "错误: 未知选项 $1" >&2; echo; usage; exit 1 ;;
    *)              SELECT_TOKENS+=("$1") ;;
  esac
  shift
done

# 默认镜像仓库（从根 pom 读取 docker.registry.url / docker.registry.host）
pom_property() {
  sed -n "s#.*<$2>\([^<]*\)</$2>.*#\1#p" "$1" 2>/dev/null | head -1
}
DEFAULT_REGISTRY_URL="$(pom_property "${BACKEND_POM}" docker.registry.url)"
DEFAULT_REGISTRY_HOST="$(pom_property "${BACKEND_POM}" docker.registry.host)"
# 将 ${docker.registry.url} 占位符替换为实际值
DEFAULT_REGISTRY_HOST="$(printf '%s' "${DEFAULT_REGISTRY_HOST}" | sed "s#\${docker.registry.url}#${DEFAULT_REGISTRY_URL}#g")"
PROJECT_VERSION="$(pom_root_version "${BACKEND_POM}")"
EFFECTIVE_REGISTRY="${REGISTRY:-${DEFAULT_REGISTRY_HOST}}"

if [ "${LIST_ONLY}" = "1" ]; then
  echo -e "${BOLD}${CYAN}可构建 Docker 镜像的后端模块${NC}"
  echo -e "${DIM}Java: ${JAVA_VER}${NC}"
  echo -e "${DIM}Maven: ${MVN_VER}${NC}"
  echo -e "${DIM}工程: ${BACKEND_POM}${NC}"
  echo -e "${DIM}镜像仓库: ${EFFECTIVE_REGISTRY}  版本: ${PROJECT_VERSION}${NC}"
  echo ""
  print_modules
  echo ""
  echo -e "${DIM}镜像名形如: ${EFFECTIVE_REGISTRY}/knowledge/<artifactId>:${PROJECT_VERSION}${NC}"
  exit 0
fi

# ---------- 选择模块 ----------
if [ "${#SELECT_TOKENS[@]}" -eq 0 ]; then
  prompt_selection "Knowledge Cloud - Docker 镜像构建"
fi

resolve_selection

if selection_is_empty; then
  echo -e "${RED}错误: 未选择任何模块。${NC}" >&2
  exit 1
fi

# ---------- Docker 插件相关属性 ----------
DOCKER_PROPS=()
if [ -n "${DOCKER_HOST_ARG}" ]; then
  DOCKER_PROPS+=("-Ddocker.host=${DOCKER_HOST_ARG}")
elif [ -n "${DOCKER_HOST:-}" ]; then
  DOCKER_PROPS+=("-Ddocker.host=${DOCKER_HOST}")
fi
if [ -n "${REGISTRY}" ]; then
  DOCKER_PROPS+=("-Ddocker.registry.host=${REGISTRY}")
  DOCKER_PROPS+=("-Ddocker.registry.url=${REGISTRY%%:*}")
fi

run() {
  if [ "${DRY_RUN}" = "1" ]; then
    echo -e "${CYAN}>> $(printf '%q ' "$@")${NC}"
  else
    echo -e "${CYAN}>> $(printf '%q ' "$@")${NC}"
    "$@"
  fi
}

# ---------- 逐个模块执行 ----------
echo ""
echo -e "${BOLD}目标模块:${NC}"
if [ "${ALL}" = "1" ]; then
  echo -e "  ${GREEN}all${NC}  ${DIM}(${#MOD_PATHS[@]} 个模块)${NC}"
else
  print_selected
fi
echo -e "${DIM}使用 Java:  ${JAVA_VER}${NC}"
echo -e "${DIM}使用 Maven: ${MVN_VER}${NC}"
echo -e "${DIM}镜像仓库: ${EFFECTIVE_REGISTRY}  版本: ${PROJECT_VERSION}${NC}"

TARGET_IDX=("${SELECTED_IDX[@]}")
if [ "${ALL}" = "1" ]; then
  TARGET_IDX=("${!MOD_PATHS[@]}")
fi

for idx in "${TARGET_IDX[@]}"; do
  path="${MOD_PATHS[$idx]}"
  artifact="${MOD_IDS[$idx]}"
  echo ""
  echo -e "${BOLD}==> ${artifact}  ${DIM}(${path})${NC}"
  echo -e "${DIM}    预计镜像: ${EFFECTIVE_REGISTRY}/knowledge/${artifact}:${PROJECT_VERSION}${NC}"

  if [ "${DO_BUILD}" = "1" ]; then
    BUILD_CMD=("${MVN}" -f "${BACKEND_POM}")
    [ "${DO_CLEAN}" = "1" ] && BUILD_CMD+=(clean)
    BUILD_CMD+=(package -DskipTests)
    [ "${OFFLINE}" = "1" ] && BUILD_CMD+=(-o)
    [ "${PARALLEL}" = "1" ] && BUILD_CMD+=(-T 1C)
    BUILD_CMD+=(-pl "${path}" -am)
    run "${BUILD_CMD[@]}"
  fi

  DOCKER_CMD=("${MVN}" -f "${BACKEND_POM}" -pl "${path}")
  [ "${OFFLINE}" = "1" ] && DOCKER_CMD+=(-o)
  DOCKER_CMD+=(docker:build)
  [ "${#DOCKER_PROPS[@]}" -gt 0 ] && DOCKER_CMD+=("${DOCKER_PROPS[@]}")
  [ "${#EXTRA_ARGS[@]}" -gt 0 ] && DOCKER_CMD+=("${EXTRA_ARGS[@]}")
  run "${DOCKER_CMD[@]}"

  if [ "${DO_PUSH}" = "1" ]; then
    PUSH_CMD=("${MVN}" -f "${BACKEND_POM}" -pl "${path}")
    [ "${OFFLINE}" = "1" ] && PUSH_CMD+=(-o)
    PUSH_CMD+=(docker:push)
    [ "${#DOCKER_PROPS[@]}" -gt 0 ] && PUSH_CMD+=("${DOCKER_PROPS[@]}")
    [ "${#EXTRA_ARGS[@]}" -gt 0 ] && PUSH_CMD+=("${EXTRA_ARGS[@]}")
    run "${PUSH_CMD[@]}"
  fi
done

echo ""
if [ "${DRY_RUN}" = "1" ]; then
  echo -e "${YELLOW}--dry-run: 未执行任何构建。${NC}"
else
  echo -e "${BOLD}${GREEN}完成。${NC}"
fi
