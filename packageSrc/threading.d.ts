interface ThreadFeatures {
    sleep: (time: number) => void;
}
type ThreadAction<TReturn, TShared> = (sharedObject: TShared, imports: Record<string, Function>, threadFeatures: ThreadFeatures) => TReturn;
declare class Thread<TResult, TShared> implements PromiseLike<TResult> {
    private worker?;
    private promise?;
    private result?;
    private execute;
    constructor(target: ThreadAction<TResult, TShared>, sharedObject?: Record<string, any> | null, imports?: Record<string, string[]> | null);
    static sleep: (delay: number) => void;
    then<TResult1 = TResult, TResult2 = never>(onfulfilled?: ((value: TResult) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): Promise<TResult1 | TResult2>;
    unwrap(): {
        runtime?: number;
        relativeStart?: Date;
        relativeEnd?: Date;
        result: TResult;
        error: Error;
    };
}
export { Thread, ThreadAction };
