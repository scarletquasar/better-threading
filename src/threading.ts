import { UUID, randomUUID } from "node:crypto";
import { Worker, isMainThread, parentPort } from "node:worker_threads";

interface ThreadFeatures {
    sleep: (time: number) => void;
    ref: {
        set: typeof Ref.set,
        get: typeof Ref.get
    }
}

type ThreadAction<TReturn, TShared> = (
    sharedObject: TShared, 
    imports: Record<string, Function>,
    threadFeatures: ThreadFeatures) => TReturn;

function sleep(delay: number) {
    var now = new Date().getTime();
    while(new Date().getTime() < now + delay) { }
}

// 'Represents' a shared reference to an object that is 'present' in all the
// threads at the same time. Backwards does the work of copying the most
// updated value to all the threads using safety constraints like thread locks
// Ref is unsafe by default and is not going to grant any stability between the
// data shared unless the developer knows what is being made
class Ref<T> {
    private _id: UUID = "-----";
    private content?: T | null;

    get id() {
        return this._id;
    }

    private set id(value: UUID) {
        this._id = value;
    }

    asCopy() {
        return JSON.parse(this.toString()) as Ref<T>
    }

    static create<T>(value: T) {
        if (!isMainThread) {
            throw new Error("A shared reference needs to be created in the main thread.");
        }

        if (!(<any>globalThis)._sharedThreadingRefs) {
            (<any>globalThis)._sharedThreadingRefs = {};
        }

        const ref = new Ref<T>();
        ref.id = randomUUID();
        ref.content = value;
        
        (<any>globalThis)._sharedThreadingRefs[ref.id] = ref;

        return JSON.parse(ref.toString()) as Ref<T>;
    }

    static set<T>(id: UUID, value: T) {
        (<any>globalThis)._sharedThreadingRefs[id].content = value;
        parentPort?.postMessage({
            type: 'ref-update',
            refs: (<any>globalThis)._sharedThreadingRefs
        });
    }

    static get(id: UUID) {
        return (<any>globalThis)._sharedThreadingRefs[id].content;
    }

    toString() {
        return `
            {
                "type": "ref",
                "id": "${(<UUID>this.id)}",
                "content": ${JSON.stringify(this.content)}
            }
        `
    }
}

class Thread<TResult, TShared> implements PromiseLike<TResult> {
    private worker?: Worker;
    private promise?: Promise<TResult>;
    private result?: TResult | Error;
    private factory: () => Promise<TResult>;

    constructor(
        target: ThreadAction<TResult, TShared>,  
        sharedObject?: Record<string, any> | null,
        imports?: Record<string, string[]> | null
    ) {
        let importsCode = "";
        const defaultFeatures = `
            const __feats = {
                sleep: ${sleep.toString()},
                ref: {
                    set: ${Thread.setRef.toString()},
                    get: ${Thread.getRef.toString()}
                }
            }
        `;
        
        const sharedFinal = {} as Record<string, any>;
        const sharedCode = [] as string[];

        Object.entries(sharedObject ?? {}).forEach(entry => {
            if (entry[1].type === "ref") {
                sharedCode.push(`globalThis._sharedThreadingRefs["${entry[1].id}"] = ${JSON.stringify(entry[1])};`);
                sharedCode.push(`__shared["${entry[0]}"] = ${JSON.stringify(entry[1])};`);
            }

            sharedFinal[entry[0]] = entry[1];
        });

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
            globalThis._sharedThreadingRefs = {};
            const { parentPort } = require("node:worker_threads");
            const __shared = ${JSON.stringify(sharedFinal ?? {})};
            const __imports = {};
            ${importsCode}
            ${sharedCode.join("")}

            const __op_result = (${target.toString()})(__shared, __imports, __feats);
            parentPort.postMessage({ type: "completion", value: __op_result });
        `;

        this.factory = () => {
            this.promise = new Promise<TResult>((resolve, reject) => {
                this.worker = new Worker(defaultFeatures + assembledValue, { eval: true });

                this.worker.on('error', (err) => {
                    this.result = err;
                    reject(this.result);
                });
                this.worker.on('message', (data: any) => {
                    if (data.type === 'completion') {
                        this.result = data.value;
                        resolve(<TResult>this.result);
                    }

                    if (data.type === 'ref-update') {
                        (<any>globalThis)._sharedThreadingRefs = data.refs;
                    }
                });
            });

            return this.promise;
        }
    }

    private async start() {
        return this.factory() as Promise<TResult | Error>;
    }

    // Feature functions - will be provided in the 'thread' variable in ThreadAction
    private static setRef = (id: UUID, value: unknown) => {
        (<any>globalThis)._sharedThreadingRefs[id].content = value;
        require("node:worker_threads").parentPort?.postMessage({
            type: 'ref-update',
            refs: (<any>globalThis)._sharedThreadingRefs
        });
    }

    private static getRef = (id: UUID) => {
        return (<any>globalThis)._sharedThreadingRefs[id].content;
    }

    public static sleep = (delay: number) => {
        let now = new Date().getTime();
        while(new Date().getTime() < now + delay) { }
    }

    // Promise-like implementation
    async then<TResult1 = TResult, TResult2 = never>(
        onfulfilled?: ((value: TResult) => TResult1 | PromiseLike<TResult1>) | undefined | null, 
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): Promise<TResult1 | TResult2> {
        const result = await this.start();

        if (result instanceof Error) {
            return (onrejected ? onrejected(result) : {} as never);
        }

        return <TResult1>(onfulfilled ? onfulfilled(result) : {} as TResult);
    }
}

export { Thread, ThreadAction, Ref }