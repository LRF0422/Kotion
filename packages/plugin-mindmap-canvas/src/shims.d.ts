declare module "react/jsx-runtime" {
  export const jsx: any;
  export const jsxs: any;
  export const Fragment: any;
}

declare module "react" {
  export type FC<P = any> = (props: P) => any;
  export type MouseEventHandler<T = any> = (event: any) => void;
  export type ChangeEvent<T = any> = any;
  export function useEffect(effect: any, deps?: any): void;
  export function useMemo<T>(factory: () => T, deps: any[]): T;
  export function useRef<T>(value: T | null): { current: T | null };
  export function useState<T>(value: T | (() => T)): [T, (v: T | ((prev: T) => T)) => void];
  const React: any;
  export default React;
}

declare module "@tiptap/core";
declare module "nanoid";

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}
