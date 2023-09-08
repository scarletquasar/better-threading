# better-threading

The better-threading library is a **experiment** created to provide a multi-threading flavour completely binded with Node.js promises. The 
real objective is reducing the entropy of multi-threaded operations with syntax tricks and useful features like concurrency-focused
data structures. This project is being actively developed by the Ember Labs team. We enforce that this project is not suitable for any production level
implementation yet and there is a possibility that it will never be.

## Usage

Currently the package provided in `npm` has no exports. We are working on that. We plan to expose the `Thread` object in the library with the objective
of creating smart thread objects that receive configuration options and a closure that will be copied and executed in a worker backwards.

Practical example:

```ts
const threadOneAction: ThreadAction<string> = (shared, imports, thread) => {
    thread.sleep(5000);
    return "Hi from thread one.";
};

const threadTwoAction: ThreadAction<string> = (shared, imports, thread) => {
    thread.sleep(3000);
    return "Hi from thread two.";
};

const threadThreeAction: ThreadAction<string> = (shared, imports, thread) => {
    thread.sleep(1000);
    return "Hi from thread three.";
};

const threadOne = new Thread(threadOneAction);
const threadTwo = new Thread(threadTwoAction);
const threadThree = new Thread(threadThreeAction);

console.log(await threadOne);
console.log(await threadTwo);
console.log(await threadThree);

// Output:
// Hi from thread three.
// Hi from thread two.
// Hi from thread one.
```

In the future we will provide a detailed documentation about the library capabilities.