declare module 'agentation' {
  import type { FC } from 'react';
  export interface AgentationProps {
    endpoint?: string;
  }
  export const Agentation: FC<AgentationProps>;
}
