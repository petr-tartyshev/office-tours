#!/usr/bin/env bash
set -e

# Скрипт отправляет все изменения сразу на GitHub

git add -A

# Если нечего коммитить, git вернёт ненулевой код — просто выходим без ошибки
git commit -m "Update bot" || exit 0

git push

