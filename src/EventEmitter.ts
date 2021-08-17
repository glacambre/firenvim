
export class EventEmitter<T extends string, U extends (...args: any[]) => void> {
    private listeners = new Map<T, U[]>();

    on(event: T, handler: U) {
        let handlers = this.listeners.get(event);
        if (handlers === undefined) {
            handlers = [];
            this.listeners.set(event, handlers);
        }
        handlers.push(handler);
    }

    emit(event: T, ...data: any) {
        const handlers = this.listeners.get(event);
        if (handlers !== undefined) {
            const errors : Error[] = [];
            handlers.forEach((handler) => {
                try {
                    handler(...data);
                } catch (e) {
                    /* istanbul ignore next */
                    errors.push(e);
                }
            });
            /* Error conditions here are impossible to test for from selenium
             * because it would arise from the wrong use of the API, which we
             * can't ship in the extension, so don't try to instrument. */
            /* istanbul ignore next */
            if (errors.length > 0) {
                throw new Error(JSON.stringify(errors));
            }
        }
    }
}
