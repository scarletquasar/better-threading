
interface ThreadCommunicationChannel {
    run: <TReturn, TShared>(action: (shared: TShared) => TReturn) => Promise<TReturn>;
    close: () => Promise<void>;
}

interface Thread {
    status: 'created' | 'free' | 'occupied' | 'panicked';

    //Initialize a single thread with no specified custom behavior. The thread
    //will be dormant and should be called with 'open' to be available for
    //operations.
    init: () => Promise<void>;

    //Creates a connection between the caller thread and this thread, is useful
    //for communication purposes, like running code remotely without references
    //(for that, function serialization and shared object serialization are used).
    open: () => Promise<ThreadCommunicationChannel>;

    //Deletes the thread entirely and ends its process to free resources of the 
    //current device. Make sure to call it when the thread is not being used 
    //anymore in the program, even it falls out the scope where being used.
    dispose: () => Promise<void>;
}

interface ThreadPool {
    //Initialize the thread pool with N dormant threads and one single separated
    //thread that will act as queue checker for incoming calls.
    init: (threadCount: number) => Promise<void>; 

    //Borrows the next free thread from the thread pool that is available next. If
    //no threads are available, it will wait until one is freed. The thread pool can
    //be configured with a timeout to avoid deadlocks, but it will cause a runtime
    //error when out and the action will not be executed - what can cause problems
    //like race conditions and segfaults. The thread pool can also be configured to
    //execute the actions synchronously (in the current event loop) if the timeout
    //comes to an end and nothing can be done to execute the operation.
    open: () => Promise<ThreadCommunicationChannel>; 

    //Redeclare all the panicked threads in the current thread pool. This function will
    //force a call in 'dispose' of these threads, causing a total interruption of the 
    //processes, then create new threads and assign them in the same place where the old
    //threads were.
    recycle: () => Promise<void>; 
}