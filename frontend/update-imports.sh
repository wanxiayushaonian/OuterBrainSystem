#!/bin/bash
# Update import paths after directory refactoring

cd /home/ljb/program/demo/OuterBrainSystem/frontend/src

# Update imports in all TypeScript files
find . -name "*.ts" -type f ! -name "*.old.ts" -exec sed -i \
  -e "s|from '../runtime|from '../core/runtime|g" \
  -e "s|from './runtime|from './core/runtime|g" \
  -e "s|from '../session|from '../core/session|g" \
  -e "s|from './session|from './core/session|g" \
  -e "s|from '../state'|from '../core/types/state'|g" \
  -e "s|from './state'|from './core/types/state'|g" \
  -e "s|from '../types'|from '../core/types/types'|g" \
  -e "s|from './types'|from './core/types/types'|g" \
  -e "s|from '../canvas|from '../features/canvas|g" \
  -e "s|from './canvas|from './features/canvas|g" \
  -e "s|from '../ai|from '../features/chat|g" \
  -e "s|from './ai|from './features/chat|g" \
  -e "s|from '../inbox|from '../features/inbox|g" \
  -e "s|from './inbox|from './features/inbox|g" \
  -e "s|from '../components|from '../shared/components|g" \
  -e "s|from './components|from './shared/components|g" \
  -e "s|from '../utils|from '../shared/utils|g" \
  -e "s|from './utils|from './shared/utils|g" \
  {} \;

echo "Import paths updated"
