// This is an incomplete implementation of
// https://nodejs.org/api/events.html
class NodeEventEmitter {
    private all_listeners: {[key:string]: (() => any)[]} = {};

    constructor () { }

    addListener (evname: string, listener: () => any) {
        this.on(evname, listener);
    }

    emit (evname: string, ...args: any[]) {
        if (!this.all_listeners[evname])
            return;
        this.all_listeners[evname].map(l => l.apply(this, args));
    }

    eventNames () {
        return Object.keys(this.all_listeners);
    }

    listeners (evname: string) {
        if (!this.all_listeners[evname])
            return;
        return this.all_listeners[evname].slice();
    }

    on (evname: string, listener: () => any) {
        if (!this.all_listeners[evname]) {
            this.all_listeners[evname] = [];
        }
        this.all_listeners[evname].push(listener);
    }

    // Creates a lambda that will try to remove itself from the `listeners`
    // array when called
    selfRemovingListener (evname: string, listener: () => any) {
        let fn = (...args: any[]) => {
            this.removeListener(evname, fn);
            listener.apply(this, args);
        }
        return fn;
    }

    once (evname: string, listener: () => any) {
        this.on(evname, this.selfRemovingListener(evname, listener));
    }

    prependListener (evname: string, listener: () => any) {
        if (!this.all_listeners[evname])
            this.all_listeners[evname] = [];
        this.all_listeners[evname].unshift(listener);
    }

    prependOnceListener (evname: string, listener: () => any) {
        this.prependListener(evname, this.selfRemovingListener(evname, listener));
    }

    removeAllListeners (evname: string) {
        this.all_listeners[evname] = [];
    }

    removeListener (evname: string, listener: () => any) {
        if (!this.all_listeners[evname])
            return;
        let i = this.all_listeners[evname].indexOf(listener);
        if (i >= 0)
            this.all_listeners[evname] = this.all_listeners[evname].splice(i, 1);
    }
}

class NeovimStdin extends NodeEventEmitter {
    port: Port;

    constructor(port: Port) {
        super();
        this.port = port;
    }

    write(str: string) {
        this.port.postMessage(str);
    }
}

class NeovimStdout extends NodeEventEmitter {
    port: Port;

    constructor(port: Port) {
        super();
        this.port = port;
        this.port.onMessage.addListener(this.onMessage.bind(this))
    }

    private onMessage(msg: any) {
        console.log(msg);
    }

    read() {
        console.log("Called read fn");
    }
}

class NeovimProcess {
    stdin : ProxyHandler<NeovimStdin>;
    stdout: ProxyHandler<NeovimStdout>;

    constructor() {
        let port = browser.runtime.connectNative("firenvim");
        let proxy = {
            get: (obj: any, prop: any): any => {
                if (obj[prop] !== undefined)
                    return obj[prop];
                console.log(obj);
                throw new Error(`Property "${prop}" doesn't exist in "${obj}"`);
            },
            set: (obj: any, prop: any, value: any): boolean => {
                let retval = obj[prop] === undefined
                if (retval)
                    console.warn(`Setting new property "${prop}" to `, value, " in ", obj);
                obj[prop] = value;
                return retval;
            },
        };
        this.stdin = new Proxy(new NeovimStdin(port), proxy);
        this.stdout = new Proxy(new NeovimStdout(port), proxy);
    }

}

exports.NeovimProcess = NeovimProcess;
