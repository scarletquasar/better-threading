import { Worker } from 'node:worker_threads';

interface ThreadFeatures {
    sleep: (time: number) => void;
}

type ThreadAction<TReturn, TShared> = (
    sharedObject: TShared, 
    imports: Record<string, Function>,
    threadFeatures: ThreadFeatures) => TReturn;

function sleep(delay: number) {
    var start = performance.now();
    while(performance.now() < start + delay) { }
}

class Thread<TResult, TShared> implements PromiseLike<TResult> {
    private worker?: Worker;
    private promise?: Promise<TResult>;
    private result?: {
        runtime?: number,
        relativeStart?: Date,
        relativeEnd?: Date,
        result: TResult | undefined,
        error: Error | undefined
    };
    private execute: () => Promise<TResult>;

    constructor(
        target: ThreadAction<TResult, TShared>,  
        sharedObject: Record<string, any> | null = {},
        imports: Record<string, string[]> | null = {}
    ) {    
        const sharedFinal = {} as Record<string, any>;

        Object.entries(sharedObject ?? {}).forEach(entry => {
            sharedFinal[entry[0]] = entry[1];
        });

        const assembledClosure = (
            target: ThreadAction<TResult, TShared>, 
            shared: Record<string, any>, 
            imports: Record<string, string[]>,
            features: ThreadFeatures) => {
            // Defines the better-threading global object in a newly
            // created thread. The objective is avoiding conflicts
            // and storing all the needed objects to provide imports
            // and object sharing features.
            (<any>globalThis)["better-threading"] = {};
            (<any>globalThis)["better-threading"].imports = {};
            (<any>globalThis)["better-threading"].imports.performance = require('perf_hooks').performance;
            (<any>globalThis)["better-threading"].features = features;

            const threadStartPerformanceTime = performance.now();
            const threadRelativeStart = new Date();

            (<any>globalThis)["better-threading"].imports.parentPort = require("node:worker_threads").parentPort;
            (<any>globalThis)["better-threading"].shared = shared;

            // Setup object imports; No support to default imports yet.
            Object
                .entries(imports)
                .forEach(importEntry => {
                    (<any>globalThis)["better-threading"].imports[importEntry[0]] = {}

                    importEntry[1].forEach(value => {
                        (<any>globalThis)["better-threading"].imports[importEntry[0]][value] = require(importEntry[0])[value];
                    });
                });

            let result = undefined;
            let error: Error | undefined = undefined;

            try {
                result = target(
                    (<any>globalThis)["better-threading"].shared,
                    (<any>globalThis)["better-threading"].imports,
                    (<any>globalThis)["better-threading"].features
                );
            }
            catch (e) {
                error = <Error>e;
            }

            const threadEndPerformanceTime = performance.now();
            const threadRelativeEnd = new Date();

            (<any>globalThis)["better-threading"].imports.parentPort.postMessage({
                runtime: threadEndPerformanceTime - threadStartPerformanceTime,
                relativeStart: threadRelativeStart,
                relativeEnd: threadRelativeEnd,
                type: "completion",
                result,
                error
            })
        }

        let textScript = `
            (${assembledClosure.toString()})
            (
                ${target.toString()}, 
                ${JSON.stringify(sharedFinal)}, 
                ${JSON.stringify(imports)}, 
                {
                    sleep: ${sleep.toString()}
                }
            );`;

        this.execute = () => {
            this.promise = new Promise<TResult>((resolve, reject) => {
                this.worker = new Worker(textScript, { eval: true });

                this.worker.on('error', (err) => {
                    reject(err);
                });

                this.worker.on('message', (data: any) => {
                    if (data.type === 'completion') {
                        this.result = data;
                        resolve(<TResult>this.result);
                    }
                });
            });

            return this.promise;
        }
    }

    // Internal shared features
    public static sleep = (delay: number) => {
        let now = new Date().getTime();
        while(new Date().getTime() < now + delay) { }
    }

    // Promise-like implementation
    async then<TResult1 = TResult, TResult2 = never>(
        onfulfilled?: ((value: TResult) => TResult1 | PromiseLike<TResult1>) | undefined | null, 
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): Promise<TResult1 | TResult2> {

        return this.execute().then(onfulfilled, onrejected);
    }

    unwrap() {
        if (this.result == undefined) {
            throw new ReferenceError("No result is defined for this thread. Was it executed and finished?");
        }

        return this.result;
    }
}

export { Thread, ThreadAction }