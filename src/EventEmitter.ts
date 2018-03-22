// This is an incomplete implementation of
// https://nodejs.org/api/events.html
class EventEmitter {
    private allListeners: {[key: string]: Array<() => any>};

    constructor() {
        this.allListeners = {};
    }

    public addListener(evname: string | symbol, listener: (...args: any[]) => any) {
        this.on(evname, listener);
        return this as any;
    }

    public emit(evname: string | symbol, ...args: any[]) {
        if (!this.allListeners[evname]) {
            return;
        }
        this.allListeners[evname].map((l) => l.apply(this, args));
        return this as any;
    }

    public eventNames() {
        return Object.keys(this.allListeners);
    }

    public getMaxListeners() {
        // Infinity
        return 1 / 0;
    }

    public listenerCount(evname: string) {
        if (!this.allListeners[evname].length) {
            return 0;
        }
        return this.allListeners[evname].length;
    }

    public listeners(evname: string) {
        if (!this.allListeners[evname]) {
            return;
        }
        return this.allListeners[evname].slice();
    }

    public on(evname: string | symbol, listener: (...args: any[]) => any) {
        if (!this.allListeners[evname]) {
            this.allListeners[evname] = [];
        }
        this.allListeners[evname].push(listener);
        return this as any;
    }

    // Creates a lambda that will try to remove itself from the `listeners`
    // array when called
    public selfRemovingListener(evname: string | symbol, listener: (...args: any[]) => any) {
        const fn = (...args: any[]) => {
            this.removeListener(evname, fn);
            listener.apply(this, args);
        };
        return fn;
    }

    public once(evname: string | symbol, listener: (...args: any[]) => any) {
        return this.on(evname, this.selfRemovingListener(evname, listener));
    }

    public prependListener(evname: string | symbol, listener: (...args: any[]) => any) {
        if (!this.allListeners[evname]) {
            this.allListeners[evname] = [];
        }
        this.allListeners[evname].unshift(listener);
        return this as any;
    }

    public prependOnceListener(evname: string | symbol, listener: (...args: any[]) => any) {
        return this.prependListener(evname, this.selfRemovingListener(evname, listener));
    }

    public removeAllListeners(evname: string | symbol) {
        this.allListeners[evname] = [];
        return this as any;
    }

    public removeListener(evname: string | symbol, listener: (...args: any[]) => any) {
        if (!this.allListeners[evname]) {
            return;
        }
        const i = this.allListeners[evname].indexOf(listener);
        if (i >= 0) {
            this.allListeners[evname] = this.allListeners[evname].splice(i, 1);
        }
        return this as any;
    }

    public setMaxListeners(n: number) {
        console.warn("setMaxListeners not implemented");
        return this as any;
    }

    public rawListeners(evname: string) {
        return this.listeners(evname);
    }
}
