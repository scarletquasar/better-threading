import { Thread, ThreadAction } from "./src/threading";

const action1: ThreadAction<number> = () => {
    let a = 1;
    return a;
};

const action2: ThreadAction<number> = (shared, imports, thread) => {
    let a = 2;
    thread.sleep(3000);
    return a;
};


const action3: ThreadAction<number> = (shared, imports, thread) => {
    let a = 3;
    thread.sleep(2000);
    return a;
};


const thread1 = new Thread(action1);
const thread2 = new Thread(action2);
const thread3 = new Thread(action3);

thread1.start().then(console.log);
thread2.start().then(console.log);
thread3.start().then(console.log);