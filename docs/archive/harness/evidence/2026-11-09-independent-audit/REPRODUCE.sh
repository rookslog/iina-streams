#!/bin/sh
# Read-only reproduction of the 2026-11-09 independent-audit runtime probes.
# Renders the model-visible Codex prompt without calling a model. Changes no config.
set -eu
cd /Users/rookslog/Development/iina-streams-candidates
codex --version
grep -c 'iina' ~/.codex/config.toml || echo "no iina trust entry"
codex debug prompt-input probe > /tmp/iina-prompt-input.json
grep -o 'There are [0-9]* available concurrency slots' /tmp/iina-prompt-input.json
grep -c 'streams_' /tmp/iina-prompt-input.json || echo "streams_* roles absent"
