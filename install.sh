#!/usr/bin/env bash
# Install one skill from this repo into a skills directory.
#   ./install.sh <skill-name> [target-dir]
# Default target: ~/.agents/skills
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "usage: $0 <skill-name> [target-dir]" >&2
  exit 1
fi

name="$1"
target="${2:-$HOME/.agents/skills}"
root="$(cd "$(dirname "$0")" && pwd)"
src="$root/skills/$name"

if [ ! -d "$src" ]; then
  echo "error: no such skill: $name" >&2
  echo "available:" >&2
  ls -1 "$root/skills" >&2 || true
  exit 1
fi
if [ ! -f "$src/SKILL.md" ]; then
  echo "error: $name has no SKILL.md" >&2
  exit 1
fi

mkdir -p "$target"
dest="$target/$name"

if [ -d "$dest" ]; then
  backup="$dest.bak.$(date +%Y%m%d%H%M%S)"
  mv "$dest" "$backup"
  echo "backed up existing skill to $backup"
fi

cp -R "$src" "$dest"
echo "installed $name -> $dest"
