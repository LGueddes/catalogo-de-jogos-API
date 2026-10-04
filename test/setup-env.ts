import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { applyTestEnv } from './test-env.js';

applyTestEnv();
Logger.overrideLogger(false);
