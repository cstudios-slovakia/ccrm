declare module 'agentation' {
  import type { FC } from 'react';
  export interface AgentationProps {
    endpoint?: string;
  }
  export const Agentation: FC<AgentationProps>;
}

declare module 'ogl' {
  export class Renderer {
    constructor(options?: any);
    gl: any;
    setSize(width: number, height: number): void;
    render(options: any): void;
    [key: string]: any;
  }
  export class Program {
    constructor(gl: any, options?: any);
    [key: string]: any;
  }
  export class Triangle {
    constructor(gl: any, options?: any);
    [key: string]: any;
  }
  export class Mesh {
    constructor(gl: any, options?: any);
    [key: string]: any;
  }
  export class Color {
    constructor(color?: any);
    [key: string]: any;
  }
}

