#!/bin/sh

# Minimal husky bootstrap (offline friendly)
if [ -z "$husky_skip_init" ]; then
  husky_skip_init=1
  export husky_skip_init

  command_exists() {
    command -v "$1" >/dev/null 2>&1
  }

  # Windows 10 Git Bash workaround
  if command_exists winpty && test -t 1; then
    exec < /dev/tty
  fi
fi
