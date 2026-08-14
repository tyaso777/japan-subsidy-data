import type { ProgramConfiguration } from './domain/types';

declare global {
  interface Window {
    PL_SUBSIDY_PROGRAM?: ProgramConfiguration;
  }
}

declare module '*.css';

export {};
