import { Ref, Thread, ThreadAction } from "./src/threading";

const ref = Ref.create("hello");
const shared = { ref };

const action1: ThreadAction<void, typeof shared> = (shared, imports, thread) => {
    const ref = shared.ref;

    thread.sleep(1000);
    thread.ref.set(shared.ref.id, "world");
};

const thread1 = new Thread(action1, shared);

// Before global change
console.log(Ref.get(ref.id));

(async () => {
    await thread1;
    // After global change
    console.log(Ref.get(ref.id));
})()