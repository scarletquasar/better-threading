import { Worker, parentPort } from "node:worker_threads";

interface ThreadOptions {
    async?: boolean; 
}

interface ThreadFeatures {
    sleep: (time: number) => void;
}

type ThreadAction<T> = (
    sharedObject: Record<string, any>, 
    imports: Record<string, Function>,
    threadFeatures: ThreadFeatures) => T | Promise<T>;

class Thread<T> {
    private worker?: Worker;
    private promise?: Promise<T>;
    private result?: T | Error;
    private factory: () => Promise<T>;

    constructor(
        target: ThreadAction<T>, 
        options?: ThreadOptions | null, 
        sharedObject?: Record<string, any> | null,
        imports?: Record<string, string[]> | null
    ) {
        let assembledValue = "";
        let importsCode = "";
        const defaultFeatures = `
            const __feats = {
                sleep: (delay) => {
                    var now = new Date().getTime();
                    while(new Date().getTime() < now + delay) { }
                }
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

        if (options?.async) {
            assembledValue = `
                const { parentPort } = require("node:worker_threads");
                const __shared = ${JSON.stringify(sharedObject ?? {})};
                const __imports = {};
                ${importsCode}
                (${target.toString()})(__shared, __imports, __feats).then(parentPort.postMessage);
                `;        
        }
        else {
            assembledValue = `
                const { parentPort } = require("node:worker_threads");
                const __shared = ${JSON.stringify(sharedObject ?? {})};
                const __imports = {};
                ${importsCode}
                parentPort.postMessage((${target.toString()})(__shared, __imports, __feats));
                `;
        }
        this.factory = () => {
            this.promise = new Promise<T>((resolve, reject) => {
                this.worker = new Worker(defaultFeatures + assembledValue, { eval: true });

                this.worker.on('error', (err) => {
                    this.result = err;
                    reject(this.result);
                });
                this.worker.on('message', (value: any) => {
                    this.result = value;
                    resolve(<T>this.result);
                });
            });

            return this.promise;
        }
    }

    async start() {
        return this.factory() as Promise<T | Error>;
    }

    static sleep(delay: number) {
        var now = new Date().getTime();
        while(new Date().getTime() < now + delay){ }
    }
}

export { Thread, ThreadAction, ThreadOptions }