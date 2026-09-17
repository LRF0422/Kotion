#!/usr/bin/env bash
#
# scripts/lib/backend-common.sh
# 后端（Knowledge Cloud）构建脚本公共库：路径、颜色、JDK/Maven 探测、Maven 模块发现与选择。
# 仅供其他脚本 `source`，不要直接执行。
#

BC_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${BC_LIB_DIR}/../.." && pwd)"
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

# ---------- 探测 mvn ----------
if command -v mvn >/dev/null 2>&1; then
  MVN="mvn"
else
  MVN=""
fi
if [ -z "${MVN}" ]; then
  toolchain_mvn="$(ls -d "${ROOT_DIR}"/.toolchain/apache-maven-*/bin/mvn 2>/dev/null | sort -V | tail -1 || true)"
  if [ -n "${toolchain_mvn}" ]; then MVN="${toolchain_mvn}"; fi
fi
if [ -n "${MAVEN_BIN:-}" ]; then MVN="${MAVEN_BIN}"; fi
if [ -z "${MVN}" ] || ! command -v "${MVN}" >/dev/null 2>&1; then
  echo "错误: 找不到 mvn，请安装 Maven 或设置 MAVEN_BIN。" >&2
  exit 1
fi

# ---------- 探测 JDK（优先显式 JAVA_HOME，其次仓库 .toolchain/jdk-*，最后 PATH）----------
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

# ---------- 从 pom.xml 提取 artifactId / packaging / version ----------
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

# Maven 工程版本（根 pom 的 <version>，用于推算镜像 tag）
pom_root_version() {
  awk '
    /^[[:space:]]*<version>/ {
      if (match($0, /<version>[^<]*<\/version>/))
        print substr($0, RSTART+9, RLENGTH-19);
      exit
    }
  ' "$1"
}

# ---------- 发现模块（可构建的 jar/war 叶子模块）----------
MOD_PATHS=(); MOD_IDS=(); MOD_PKGS=()
while IFS= read -r pom; do
  dir="$(dirname "${pom}")"
  rel="${dir#${BACKEND_DIR}/}"
  [ "${rel}" = "${dir}" ] && continue      # 根 pom
  pkg="$(pom_packaging "${pom}")"
  [ -z "${pkg}" ] && pkg="jar"
  [ "${pkg}" = "pom" ] && continue             # 跳过聚合 pom
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

# ---------- 选择流程 ----------
SELECT_TOKENS=()
SELECTED_IDX=()
ALL=0

# 交互式读取选择 -> SELECT_TOKENS（无参数时调用）
prompt_selection() {
  local title="${1:-Knowledge Cloud 后端构建}"
  echo -e "${BOLD}${CYAN}"
  echo "========================================="
  echo "   ${title}"
  echo "========================================="
  echo -e "${NC}"
  echo -e "${DIM}Java: ${JAVA_VER}${NC}"
  echo -e "${DIM}Maven: ${MVN_VER}${NC}"
  echo ""
  print_modules
  echo ""
  echo -e "${CYAN}输入编号（空格/逗号分隔，如: 8 10），all 表示全部，直接回车取消${NC}"
  read -r -p "> " INPUT || INPUT=""
  if [ -z "${INPUT}" ]; then
    echo "已取消。"
    exit 0
  fi
  INPUT="${INPUT//,/ }"
  local tok
  for tok in ${INPUT}; do
    SELECT_TOKENS+=("${tok}")
  done
}

# 将 SELECT_TOKENS 解析为 SELECTED_IDX / ALL
resolve_selection() {
  local tok idx
  if [ "${#SELECT_TOKENS[@]}" -eq 0 ]; then return 0; fi
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
}

# 选择结果校验：返回非 0 表示无有效选择
selection_is_empty() {
  [ "${ALL}" = "0" ] && [ "${#SELECTED_IDX[@]}" -eq 0 ]
}

# 逗号拼接已选模块路径（-pl 参数）
selected_paths_csv() {
  local idx out=""
  for idx in "${SELECTED_IDX[@]}"; do
    [ -n "${out}" ] && out+=","
    out+="${MOD_PATHS[$idx]}"
  done
  printf '%s' "${out}"
}

# 打印已选模块
print_selected() {
  local idx
  for idx in "${SELECTED_IDX[@]}"; do
    echo -e "  ${GREEN}${MOD_IDS[$idx]}${NC}  ${DIM}(${MOD_PATHS[$idx]})${NC}"
  done
}
