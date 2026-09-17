#!/usr/bin/env bash
#
# Knowledge Cloud 后端单模块构建脚本
# ==================================
# 在 Maven 多模块工程 backend/knowledgecloud 中，单独构建指定的一个或多个模块
# （默认连同其上游依赖模块一起构建，即 mvn -pl <module> -am）。
#
# 用法:
#   bash scripts/build-backend.sh                     # 交互式选择
#   bash scripts/build-backend.sh knowledge-wiki      # 按模块名 (artifactId / 目录名 / 相对路径)
#   bash scripts/build-backend.sh 12 15               # 按 --list 中的编号
#   bash scripts/build-backend.sh knowledge-wiki knowledge-system
#   bash scripts/build-backend.sh all                 # 构建整个后端工程
#
# 选项:
#   -l, --list          只列出可构建模块后退出
#       --with-tests    运行测试（默认 -DskipTests，只打包）
#       --clean         构建前先执行 mvn clean
#       --no-deps       不构建上游依赖模块（不加 -am）
#   -o, --offline       Maven 离线模式 (-o)
#   -T, --parallel      并行构建 (-T 1C)
#   -n, --dry-run       只打印将执行的 Maven 命令，不真正构建
#   -h, --help          显示本帮助
#   -- <args...>        -- 之后的参数原样透传给 Maven
#
# 环境变量:
#   JAVA_HOME     指定使用的 JDK（默认优先使用仓库内 .toolchain/jdk-*）
#   BACKEND_DIR   后端工程根目录（默认 <repo>/backend/knowledgecloud）
#   MAVEN_BIN     指定 mvn 可执行文件（默认取 PATH 或 .toolchain/apache-maven-*）
#
# 示例:
#   bash scripts/build-backend.sh --list
#   bash scripts/build-backend.sh knowledge-agent-skills --clean
#   bash scripts/build-backend.sh 8 --with-tests
#   bash scripts/build-backend.sh knowledge-gateway -- -U
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/backend-common.sh"

# ---------- 默认参数 ----------
LIST_ONLY=0
SKIP_TESTS=1
DO_CLEAN=0
WITH_DEPS=1
OFFLINE=0
PARALLEL=0
DRY_RUN=0
EXTRA_ARGS=()

usage() {
  cat <<'USAGE'
Knowledge Cloud 后端单模块构建脚本

用法:
  bash scripts/build-backend.sh                     # 交互式选择
  bash scripts/build-backend.sh knowledge-wiki      # 按模块名 (artifactId / 目录名 / 相对路径)
  bash scripts/build-backend.sh 12 15               # 按 --list 中的编号
  bash scripts/build-backend.sh knowledge-wiki knowledge-system
  bash scripts/build-backend.sh all                 # 构建整个后端工程

选项:
  -l, --list          只列出可构建模块后退出
      --with-tests    运行测试（默认 -DskipTests，只打包）
      --clean         构建前先执行 mvn clean
      --no-deps       不构建上游依赖模块（不加 -am）
  -o, --offline       Maven 离线模式 (-o)
  -T, --parallel      并行构建 (-T 1C)
  -n, --dry-run       只打印将执行的 Maven 命令，不真正构建
  -h, --help          显示本帮助
  -- <args...>        -- 之后的参数原样透传给 Maven

环境变量:
  JAVA_HOME     指定使用的 JDK（默认优先使用仓库内 .toolchain/jdk-*）
  BACKEND_DIR   后端工程根目录（默认 <repo>/backend/knowledgecloud）
  MAVEN_BIN     指定 mvn 可执行文件（默认取 PATH 或 .toolchain/apache-maven-*）

示例:
  bash scripts/build-backend.sh --list
  bash scripts/build-backend.sh knowledge-agent-skills --clean
  bash scripts/build-backend.sh 8 --with-tests
  bash scripts/build-backend.sh knowledge-gateway -- -U
USAGE
}

# ---------- 解析命令行 ----------
while [ $# -gt 0 ]; do
  case "$1" in
    -l|--list)      LIST_ONLY=1 ;;
    --with-tests)   SKIP_TESTS=0 ;;
    --clean)        DO_CLEAN=1 ;;
    --no-deps)      WITH_DEPS=0 ;;
    -o|--offline)   OFFLINE=1 ;;
    -T|--parallel)  PARALLEL=1 ;;
    -n|--dry-run)   DRY_RUN=1 ;;
    -h|--help)      usage; exit 0 ;;
    --)             shift; EXTRA_ARGS+=("$@"); break ;;
    -*)             echo "错误: 未知选项 $1" >&2; echo; usage; exit 1 ;;
    *)              SELECT_TOKENS+=("$1") ;;
  esac
  shift
done

if [ "${LIST_ONLY}" = "1" ]; then
  echo -e "${BOLD}${CYAN}Knowledge Cloud 可构建后端模块${NC}"
  echo -e "${DIM}Java: ${JAVA_VER}${NC}"
  echo -e "${DIM}Maven: ${MVN_VER}${NC}"
  echo -e "${DIM}工程: ${BACKEND_POM}${NC}"
  echo ""
  print_modules
  echo ""
  echo -e "${DIM}用法示例: bash scripts/build-backend.sh knowledge-wiki --clean${NC}"
  exit 0
fi

# ---------- 选择模块 ----------
if [ "${#SELECT_TOKENS[@]}" -eq 0 ]; then
  prompt_selection "Knowledge Cloud - 后端模块构建"
fi

resolve_selection

if selection_is_empty; then
  echo -e "${RED}错误: 未选择任何模块。${NC}" >&2
  exit 1
fi

# ---------- 组装 Maven 命令 ----------
MVN_CMD=("${MVN}" -f "${BACKEND_POM}")
[ "${DO_CLEAN}" = "1" ] && MVN_CMD+=(clean)
MVN_CMD+=(package)
[ "${SKIP_TESTS}" = "1" ] && MVN_CMD+=(-DskipTests)
[ "${PARALLEL}" = "1" ] && MVN_CMD+=(-T 1C)
[ "${OFFLINE}" = "1" ] && MVN_CMD+=(-o)

echo ""
echo -e "${BOLD}构建目标:${NC}"
if [ "${ALL}" = "1" ]; then
  echo -e "  ${GREEN}all${NC}  ${DIM}(整个后端工程)${NC}"
else
  print_selected
  MVN_CMD+=(-pl "$(selected_paths_csv)")
  [ "${WITH_DEPS}" = "1" ] && MVN_CMD+=(-am)
fi

[ "${#EXTRA_ARGS[@]}" -gt 0 ] && MVN_CMD+=("${EXTRA_ARGS[@]}")

echo ""
echo -e "${DIM}使用 Java:  ${JAVA_VER}${NC}"
echo -e "${DIM}使用 Maven: ${MVN_VER}${NC}"
echo -e "${CYAN}>> $(printf '%q ' "${MVN_CMD[@]}")${NC}"
echo ""

if [ "${DRY_RUN}" = "1" ]; then
  echo -e "${YELLOW}--dry-run: 未执行构建。${NC}"
  exit 0
fi

cd "${BACKEND_DIR}"
"${MVN_CMD[@]}"

# ---------- 汇总产物 ----------
echo ""
echo -e "${BOLD}${GREEN}构建完成。产物:${NC}"
if [ "${ALL}" = "1" ]; then
  find "${BACKEND_DIR}" -path '*/target/*.jar' -not -name '*-sources.jar' \
    -not -name '*-javadoc.jar' -not -name '*.original' 2>/dev/null | sed "s#${BACKEND_DIR}/#  #" || true
else
  for idx in "${SELECTED_IDX[@]}"; do
    found=0
    for jar in "${BACKEND_DIR}/${MOD_PATHS[$idx]}"/target/*.jar; do
      [ -f "${jar}" ] || continue
      case "${jar}" in *-sources.jar|*-javadoc.jar|*.original) continue ;; esac
      echo "  ${jar#${BACKEND_DIR}/}"
      found=1
    done
    [ "${found}" = "0" ] && echo -e "  ${YELLOW}${MOD_PATHS[$idx]}: 未找到 jar（可能只产出了 classes）${NC}"
  done
fi
echo ""
echo -e "${BOLD}${GREEN}完成。${NC}"
