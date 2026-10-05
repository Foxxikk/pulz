#!/bin/bash
cd "$(dirname "$0")/.."
if ! curl -s -o /dev/null http://127.0.0.1:8123/index.html; then
  nohup python3 -m http.server 8123 --bind 127.0.0.1 > /tmp/claude-0/-home-claude/bc7fd394-8c22-5c33-960d-95a1a7172d61/scratchpad/http.log 2>&1 &
  sleep 1
fi
