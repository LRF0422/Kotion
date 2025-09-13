export type KeysWithTypeOf<T, Type> = { [P in keyof T]: T[P] extends Type ? P : never }[keyof T];
export type ValuesOf<T> = T[keyof T];
export interface Services {
}