

export interface Page<T> {
    records: T[],
    current: number,
    pageSize: number,
    total: number
}