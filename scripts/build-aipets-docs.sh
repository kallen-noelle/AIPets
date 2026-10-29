#!/usr/bin/env bash
# Builds the documentation site from kallen-noelle/AdoptAI-docs with the `/docs/` base,
# then copies the output to the given directory.
#
# Usage: scripts/build-aipets-docs.sh <out-dir>
#
# Environment variables:
# - AIPETS_DOCS_DIR: existing checkout to build, cloned when missing (default: aipets-docs)
# - AIPETS_DOCS_REF: branch or tag to clone (default: main)
# - AIPETS_VERSION: version shown in the docs navbar (default: version in package.json)
#
# NOTICE: the page changelogs are generated from Git history. The clone here is
# shallow, so a full history checkout must be passed in through AIPETS_DOCS_DIR
# when the changelogs matter, as the production deploy workflow does.
set -euo pipefail

out_dir="${1:?usage: scripts/build-aipets-docs.sh <out-dir>}"
docs_dir="${AIPETS_DOCS_DIR:-aipets-docs}"

if [ ! -d "$docs_dir/.git" ]; then
  git clone --depth 1 --branch "${AIPETS_DOCS_REF:-main}" https://gitee.com/kallen-noelle/AdoptAI-docs.git "$docs_dir"
fi

AIPETS_VERSION="${AIPETS_VERSION:-$(node -p "require('./package.json').version")}"
export AIPETS_VERSION

pnpm -C "$docs_dir" install --frozen-lockfile
pnpm -C "$docs_dir" run build:base

rm -rf "$out_dir"
mkdir -p "$(dirname "$out_dir")"
cp -R "$docs_dir/.vitepress/dist" "$out_dir"
