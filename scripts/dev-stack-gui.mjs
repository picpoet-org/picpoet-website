#!/usr/bin/env node
// 启动官方联调后端、website BFF 与 Flutter GUI。
import { startStack } from './stack-launcher.mjs';

process.exit(startStack({ gui: true }));