import 'reflect-metadata';
import { Logger } from '@nestjs/common';

// Mantém a saída dos testes limpa (os warnings esperados dos cenários de falha não poluem o terminal).
Logger.overrideLogger(false);
