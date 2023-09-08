import { UUID, randomUUID } from "node:crypto";
import { Worker, isMainThread, parentPort } from "node:worker_threads";

// TODO: create global data synchronization between threads and the base code

interface ThreadFeatures {
    sleep: (time: number) => void;
}

type ThreadAction<T> = (
    sharedObject: Record<string, any>, 
    imports: Record<string, Function>,
    threadFeatures: ThreadFeatures) => T;

interface ThreadOptions {
    shared: Record<string, any>,
    imports: Record<string, Function>,
    config: {

    }
}

function sleep(delay: number) {
    var now = new Date().getTime();
    while(new Date().getTime() < now + delay) { }
}

// 'Represents' a shared reference to an object that is 'present' in all the
// threads at the same time. Backwards does the work of copying the most
// updated value to all the threads using safety constraints like thread locks
class ConcurrentRef<T> {
    private id?: UUID | null;
    private lastOperation?: UUID | null;
    private locked?: boolean | null;
    private content?: T | null;

    get refId() {
        return (<UUID>this.id);
    }

    static create<T>(value: T) {
        if (!isMainThread) {
            throw new Error("A concurrent reference needs to be created in the main thread.");
        }

        if (!(<any>globalThis)._sharedThreadingRefs) {
            (<any>globalThis)._sharedThreadingRefs = {};
        }

        const ref = new ConcurrentRef<T>();
        ref.id = randomUUID();
        ref.lastOperation = ".-.-.-.-";
        ref.locked = false;
        ref.content = value;
        
        (<any>globalThis)._sharedThreadingRefs[ref.id] = ref;

        return ref;
    }

    set(value: T) {
        this.content = value;

        if (isMainThread) {
            (<any>globalThis)._sharedThreadingRefs[(<UUID>this.id)] = this;
        }
        else {
            parentPort?.postMessage({
                type: 'ref-update',
                value: this
            });
        }
    }

    get() {
        return (<any>globalThis)._sharedThreadingRefs[(<UUID>this.id)].content;
    }

    toString() {
        return `
            {
                "id": ${(<UUID>this.id)},
                "lastOperation": ${this.lastOperation},
                "locked": ${this.locked},
                "content": ${JSON.stringify(this.content)},
                "get": ${this.get.toString()},
                "set": ${this.set.toString()}
            }
        `
    }
}

class Thread<T> implements PromiseLike<T> {
    private worker?: Worker;
    private promise?: Promise<T>;
    private result?: T | Error;
    private factory: () => Promise<T>;

    constructor(
        target: ThreadAction<T>,  
        sharedObject?: Record<string, any> | null,
        imports?: Record<string, string[]> | null
    ) {
        let importsCode = "";
        const defaultFeatures = `
            const __feats = {
                sleep: ${sleep.toString()},

            }
        `;
        
        const importsArray: [string, string][] = [];

        Object.entries(imports ?? {}).forEach(item => {
            item[1].forEach(target => importsArray.push([item[0], target]));
        })

        if (imports) {
            importsCode = importsArray
                .map<string>(target => `__imports["${target[1]}"] = require("${target[0]}").${target[1]};`)
                .join("");
        }

        let assembledValue = `
            const { parentPort } = require("node:worker_threads");
            const __shared = ${JSON.stringify(sharedObject ?? {})};
            const __imports = {};
            ${importsCode}

            const __op_result = (${target.toString()})(__shared, __imports, __feats);
            parentPort.postMessage({ type: "completion", value: __op_result });
        `;

        this.factory = () => {
            this.promise = new Promise<T>((resolve, reject) => {
                this.worker = new Worker(defaultFeatures + assembledValue, { eval: true });

                this.worker.on('error', (err) => {
                    this.result = err;
                    reject(this.result);
                });
                this.worker.on('message', (data: any) => {
                    if (data.type === 'completion') {
                        this.result = data.value;
                        resolve(<T>this.result);
                    }

                    if (data.type === 'ref-update') {
                        const operationId = randomUUID();
                        const operationTask = () => {
                            if ((<any>globalThis)._sharedThreadingRefs[data.value.id].locked) {
                                return;
                            }
                            if((<any>globalThis)._sharedThreadingRefs[data.value.id].lastOperation != operationId) {
                                (<any>globalThis)._sharedThreadingRefs[data.value.id].locked = true;
                                (<any>globalThis)._sharedThreadingRefs[data.value.id] = data.value.content;
                                (<any>globalThis)._sharedThreadingRefs[data.value.id].locked = false;
                                (<any>globalThis)._sharedThreadingRefs[data.value.id].lastOperation = operationId;
                            }
                        };

                        if (!(<any>globalThis)._sharedThreadingRefs[data.value.id].locked) {
                            operationTask();
                            return;
                        }

                        const operation = setInterval(() => {
                            if ((<any>globalThis)._sharedThreadingRefs[data.value.id].locked) {
                                return;
                            }
                            if((<any>globalThis)._sharedThreadingRefs[data.value.id].lastOperation != operationId) {
                                (<any>globalThis)._sharedThreadingRefs[data.value.id].locked = true;
                                (<any>globalThis)._sharedThreadingRefs[data.value.id] = data.value.content;
                                (<any>globalThis)._sharedThreadingRefs[data.value.id].locked = false;
                                (<any>globalThis)._sharedThreadingRefs[data.value.id].lastOperation = operationId;
                            }

                            clearInterval(operation);
                        }, 10);
                    }
                });
            });

            return this.promise;
        }
    }

    private async start() {
        return this.factory() as Promise<T | Error>;
    }

    static sleep(delay: number) {
        var now = new Date().getTime();
        while(new Date().getTime() < now + delay){ }
    }

    async then<TResult1 = T, TResult2 = never>(
        onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, 
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): Promise<TResult1 | TResult2> {
        const result = await this.start();

        if (result instanceof Error) {
            return (onrejected ? onrejected(result) : {} as never);
        }

        return <TResult1>(onfulfilled ? onfulfilled(result) : {} as T);
    }
}

export { Thread, ThreadAction, ConcurrentRef }