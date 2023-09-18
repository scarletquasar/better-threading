"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Thread = void 0;
const node_worker_threads_1 = require("node:worker_threads");
function sleep(delay) {
    var start = performance.now();
    while (performance.now() < start + delay) { }
}
class Thread {
    worker;
    promise;
    result;
    execute;
    constructor(target, sharedObject = {}, imports = {}) {
        const sharedFinal = {};
        Object.entries(sharedObject ?? {}).forEach(entry => {
            sharedFinal[entry[0]] = entry[1];
        });
        const assembledClosure = (target, shared, imports, features) => {
            // Defines the better-threading global object in a newly
            // created thread. The objective is avoiding conflicts
            // and storing all the needed objects to provide imports
            // and object sharing features.
            globalThis["better-threading"] = {};
            globalThis["better-threading"].imports = {};
            globalThis["better-threading"].imports.performance = require('perf_hooks').performance;
            globalThis["better-threading"].features = features;
            const threadStartPerformanceTime = performance.now();
            const threadRelativeStart = new Date();
            globalThis["better-threading"].imports.parentPort = require("node:worker_threads").parentPort;
            globalThis["better-threading"].shared = shared;
            // Setup object imports; No support to default imports yet.
            Object
                .entries(imports)
                .forEach(importEntry => {
                globalThis["better-threading"].imports[importEntry[0]] = {};
                importEntry[1].forEach(value => {
                    globalThis["better-threading"].imports[importEntry[0]][value] = require(importEntry[0])[value];
                });
            });
            let result = undefined;
            let error = undefined;
            try {
                result = target(globalThis["better-threading"].shared, globalThis["better-threading"].imports, globalThis["better-threading"].features);
            }
            catch (e) {
                error = e;
            }
            const threadEndPerformanceTime = performance.now();
            const threadRelativeEnd = new Date();
            globalThis["better-threading"].imports.parentPort.postMessage({
                runtime: threadEndPerformanceTime - threadStartPerformanceTime,
                relativeStart: threadRelativeStart,
                relativeEnd: threadRelativeEnd,
                type: "completion",
                result,
                error
            });
        };
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
            this.promise = new Promise((resolve, reject) => {
                this.worker = new node_worker_threads_1.Worker(textScript, { eval: true });
                this.worker.on('error', (err) => {
                    reject(err);
                });
                this.worker.on('message', (data) => {
                    if (data.type === 'completion') {
                        this.result = data;
                        resolve(this.result);
                    }
                });
            });
            return this.promise;
        };
    }
    // Internal shared features
    static sleep = (delay) => {
        let now = new Date().getTime();
        while (new Date().getTime() < now + delay) { }
    };
    // Promise-like implementation
    async then(onfulfilled, onrejected) {
        return this.execute().then(onfulfilled, onrejected);
    }
    unwrap() {
        if (this.result == undefined) {
            throw new ReferenceError("No result is defined for this thread. Was it executed and finished?");
        }
        return this.result;
    }
}
exports.Thread = Thread;
