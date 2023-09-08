import { ConcurrentRef, Thread, ThreadAction } from "./src/threading";

const ref = ConcurrentRef.create("hello");
const shared = { helloObj: ref };

const action1: ThreadAction<number> = (shared, imports, thread) => {
    thread.sleep(1000);
    return 1
};

const thread1 = new Thread(action1, shared);

(async () => {
    console.log(await thread1);
})()


