#!/usr/bin/env node
/**
 * 一键启动官方联调后端与 website BFF。
 * 默认 --no-gui；stop/status 仍走 picpoet/official-dev.sh。
 */
import { startStack } from './stack-launcher.mjs';

process.exit(startStack({ gui: false }));
