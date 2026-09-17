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

# ---------- 路径 ----------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_DIR="${BACKEND_DIR:-${ROOT_DIR}/backend/knowledgecloud}"
BACKEND_POM="${BACKEND_DIR}/pom.xml"

if [ ! -f "${BACKEND_POM}" ]; then
  echo "错误: 找不到后端工程 pom.xml -> ${BACKEND_POM}" >&2
  echo "      可用 BACKEND_DIR 环境变量指定后端根目录。" >&2
  exit 1
fi

# ---------- 颜色 ----------
if [ -t 1 ]; then
  GREEN=$'\033[0;32m'; CYAN=$'\033[0;36m'; YELLOW=$'\033[1;33m'
  RED=$'\033[0;31m'; BOLD=$'\033[1m'; DIM=$'\033[2m'; NC=$'\033[0m'
else
  GREEN=''; CYAN=''; YELLOW=''; RED=''; BOLD=''; DIM=''; NC=''
fi

# ---------- 默认参数 ----------
LIST_ONLY=0
SKIP_TESTS=1
DO_CLEAN=0
WITH_DEPS=1
OFFLINE=0
PARALLEL=0
DRY_RUN=0
EXTRA_ARGS=()
SELECT_TOKENS=()

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

# ---------- 探测 mvn / java ----------
if command -v mvn >/dev/null 2>&1; then MVN="mvn"; else MVN=""; fi
if [ -z "${MVN}" ]; then
  toolchain_mvn="$(ls -d "${ROOT_DIR}"/.toolchain/apache-maven-*/bin/mvn 2>/dev/null | sort -V | tail -1 || true)"
  [ -n "${toolchain_mvn}" ] && MVN="${toolchain_mvn}"
fi
[ -n "${MAVEN_BIN:-}" ] && MVN="${MAVEN_BIN}"
if [ -z "${MVN}" ] || ! command -v "${MVN}" >/dev/null 2>&1; then
  echo "错误: 找不到 mvn，请安装 Maven 或设置 MAVEN_BIN。" >&2
  exit 1
fi

detect_jdk() {
  if [ -n "${JAVA_HOME:-}" ] && [ -x "${JAVA_HOME}/bin/java" ]; then
    echo "${JAVA_HOME}"; return
  fi
  local c
  for c in $(ls -d "${ROOT_DIR}"/.toolchain/jdk-* 2>/dev/null | sort -V -r); do
    if [ -x "${c}/Contents/Home/bin/java" ]; then echo "${c}/Contents/Home"; return; fi
    if [ -x "${c}/bin/java" ]; then echo "${c}"; return; fi
  done
  echo ""
}
DETECTED_JAVA_HOME="$(detect_jdk)"
if [ -n "${DETECTED_JAVA_HOME}" ]; then
  export JAVA_HOME="${DETECTED_JAVA_HOME}"
  export PATH="${JAVA_HOME}/bin:${PATH}"
fi

JAVA_VER="$(java -version 2>&1 | head -1 || echo 'java 未找到')"
MVN_VER="$("${MVN}" -version 2>&1 | head -1 || echo 'mvn 不可用')"

# ---------- 从 pom.xml 提取 artifactId / packaging ----------
pom_artifact_id() {
  awk '
    /^[[:space:]]*<parent>/       { p=1 }
    /^[[:space:]]*<\/parent>/    { p=0; next }
    !p && /<artifactId>/ {
      if (match($0, /<artifactId>[^<]*<\/artifactId>/))
        print substr($0, RSTART+12, RLENGTH-25);
      exit
    }
  ' "$1"
}

pom_packaging() {
  awk '
    /^[[:space:]]*<packaging>/ {
      if (match($0, /<packaging>[^<]*<\/packaging>/))
        print substr($0, RSTART+11, RLENGTH-23);
      exit
    }
    /^[[:space:]]*<dependencies>/ { exit }
  ' "$1"
}

# ---------- 发现模块（仅列出可构建的 jar/war 叶子模块）----------
MOD_PATHS=(); MOD_IDS=(); MOD_PKGS=()
while IFS= read -r pom; do
  dir="$(dirname "${pom}")"
  rel="${dir#${BACKEND_DIR}/}"
  [ "${rel}" = "${dir}" ] && continue      # 不在 BACKEND_DIR 下
  pkg="$(pom_packaging "${pom}")"
  [ -z "${pkg}" ] && pkg="jar"
  [ "${pkg}" = "pom" ] && continue             # 跳过聚合 pom，聚焦可构建模块
  MOD_PATHS+=("${rel}")
  MOD_IDS+=("$(pom_artifact_id "${pom}")")
  MOD_PKGS+=("${pkg}")
done < <(find "${BACKEND_DIR}" -name pom.xml -not -path '*/target/*' | sort)

print_modules() {
  printf "  ${BOLD}%3s  %-32s %-6s %s${NC}\n" "#" "模块 (artifactId)" "打包" "路径"
  printf "  ${DIM}%s${NC}\n" "--------------------------------------------------------------------------"
  local i
  for i in "${!MOD_PATHS[@]}"; do
    printf "  ${GREEN}%3d${NC}  %-32s %-6s ${DIM}%s${NC}\n" \
      "$((i + 1))" "${MOD_IDS[$i]}" "${MOD_PKGS[$i]}" "${MOD_PATHS[$i]}"
  done
}

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

# ---------- 解析选择 ----------
SELECTED_IDX=()
ALL=0

resolve_token() {
  local token="$1" i
  if [[ "${token}" =~ ^[0-9]+$ ]]; then
    i=$((token - 1))
    if [ "${i}" -ge 0 ] && [ "${i}" -lt "${#MOD_PATHS[@]}" ]; then
      echo "${i}"; return 0
    fi
    return 1
  fi
  for i in "${!MOD_PATHS[@]}"; do
    if [ "${token}" = "${MOD_PATHS[$i]}" ] || [ "${token}" = "${MOD_IDS[$i]}" ] || \
       [ "${token}" = "$(basename "${MOD_PATHS[$i]}")" ]; then
      echo "${i}"; return 0
    fi
  done
  return 1
}

add_idx() {
  local idx="$1" seen
  for seen in "${SELECTED_IDX[@]:-}"; do
    [ "${seen}" = "${idx}" ] && return 0
  done
  SELECTED_IDX+=("${idx}")
}

if [ "${#SELECT_TOKENS[@]}" -eq 0 ]; then
  # 交互式
  echo -e "${BOLD}${CYAN}"
  echo "========================================="
  echo "   Knowledge Cloud - 后端模块构建"
  echo "========================================="
  echo -e "${NC}"
  echo -e "${DIM}Java: ${JAVA_VER}${NC}"
  echo -e "${DIM}Maven: ${MVN_VER}${NC}"
  echo ""
  print_modules
  echo ""
  echo -e "${CYAN}输入编号（空格/逗号分隔，如: 8 10），输入 all 构建全部，直接回车取消${NC}"
  read -r -p "> " INPUT || INPUT=""
  if [ -z "${INPUT}" ]; then
    echo "已取消。"
    exit 0
  fi
  INPUT="${INPUT//,/ }"          # 逗号转空格
  for tok in ${INPUT}; do
    SELECT_TOKENS+=("${tok}")
  done
fi

for tok in "${SELECT_TOKENS[@]}"; do
  if [ "${tok}" = "all" ] || [ "${tok}" = "ALL" ]; then
    ALL=1
    continue
  fi
  if ! idx="$(resolve_token "${tok}")"; then
    echo -e "${RED}错误: 找不到模块 '${tok}'（可用名称/路径/编号，或 --list 查看）${NC}" >&2
    exit 1
  fi
  add_idx "${idx}"
done

if [ "${ALL}" = "0" ] && [ "${#SELECTED_IDX[@]}" -eq 0 ]; then
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
  PL_ARGS=""
  for idx in "${SELECTED_IDX[@]}"; do
    echo -e "  ${GREEN}${MOD_IDS[$idx]}${NC}  ${DIM}(${MOD_PATHS[$idx]})${NC}"
    [ -n "${PL_ARGS}" ] && PL_ARGS+=","
    PL_ARGS+="${MOD_PATHS[$idx]}"
  done
  MVN_CMD+=(-pl "${PL_ARGS}")
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
