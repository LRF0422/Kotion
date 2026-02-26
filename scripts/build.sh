#!/usr/bin/env bash
# Interactive build script for Knowledge Repo
# Usage: bash scripts/build.sh

set -e

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

# All buildable modules: "display_name:pnpm_filter"
MODULES=(
  "All (turbo build):__ALL__"
  "core:@kn/core"
  "editor:@kn/editor"
  "ui:@kn/ui"
  "common:@kn/common"
  "icon:@kn/icon"
  "plugin-ai:@kn/plugin-ai"
  "plugin-main:@kn/plugin-main"
  "plugin-bitable:@kn/plugin-bitable"
  "plugin-excalidraw:@kn/plugin-excalidraw"
  "plugin-mermaid:@kn/mermaid-plugin"
  "plugin-drawnix:@kn/plugin-drawnix"
  "plugin-bilibili:@kn/plugin-bilibili"
  "plugin-block-reference:@kn/plugin-block-reference"
  "plugin-drawio-v2:@kn/plugin-drawio-v2"
  "plugin-file-manager:@kn/file-manager"
  "plugin-mindmap-canvas:@kn/plugin-mindmap-canvas"
  "app (vite):vite"
  "desktop:@kn/desktop"
  "landing-page:@kn/landing-page-vite"
  "room-server:@kn/room-server"
)

echo -e "${BOLD}${CYAN}"
echo "========================================="
echo "   Knowledge Repo - Build Selector"
echo "========================================="
echo -e "${NC}"

echo -e "${YELLOW}Available modules:${NC}"
echo ""
for i in "${!MODULES[@]}"; do
  IFS=':' read -r name _ <<< "${MODULES[$i]}"
  printf "  ${GREEN}%2d${NC}) %s\n" "$((i + 1))" "$name"
done

echo ""
echo -e "${CYAN}Enter module numbers separated by spaces (e.g. 2 3 5)${NC}"
echo -e "${CYAN}Or press Enter to build all:${NC}"
echo ""
read -r -p "> " INPUT

# Default to "all" if empty
if [ -z "$INPUT" ]; then
  INPUT="1"
fi

# Collect selected filters
SELECTED=()
for num in $INPUT; do
  idx=$((num - 1))
  if [ "$idx" -lt 0 ] || [ "$idx" -ge "${#MODULES[@]}" ]; then
    echo -e "${RED}Invalid selection: $num${NC}"
    exit 1
  fi
  IFS=':' read -r name filter <<< "${MODULES[$idx]}"
  SELECTED+=("$name|$filter")
done

echo ""
echo -e "${BOLD}Building:${NC}"
for item in "${SELECTED[@]}"; do
  IFS='|' read -r name _ <<< "$item"
  echo -e "  ${GREEN}-${NC} $name"
done
echo ""

# Execute builds
for item in "${SELECTED[@]}"; do
  IFS='|' read -r name filter <<< "$item"

  if [ "$filter" = "__ALL__" ]; then
    echo -e "${CYAN}>> Building all modules with turbo...${NC}"
    pnpm build
  else
    echo -e "${CYAN}>> Building ${BOLD}$name${NC}${CYAN} (${filter})...${NC}"
    pnpm --filter "$filter" build
  fi

  echo -e "${GREEN}>> Done: $name${NC}"
  echo ""
done

echo -e "${BOLD}${GREEN}Build complete!${NC}"
