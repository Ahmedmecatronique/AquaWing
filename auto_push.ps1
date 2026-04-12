#!/bin/bash
# Compat : délègue à auto_push.sh (contenu Bash, pas PowerShell).
exec "$(dirname "$0")/auto_push.sh"
