
class ListNode<T> {
    next : ListNode<T> = undefined;
    constructor (public value: T) {}
}

class FIFOList<T> {
    private first : ListNode<T> = undefined;
    private last : ListNode<T> = undefined;
    push (value: T) {
        const v = new ListNode(value);
        if (this.first === undefined) {
            this.first = v;
        }
        if (this.last !== undefined) {
            this.last.next = v;
        }
        this.last = v;
    }
    pop (): T {
        if (this.empty()) {
            throw new Error("Attempting to pop empty list");
        }
        const result = this.first.value;
        const next = this.first.next;
        this.first.next = undefined;
        this.first = next;
        return result;
    }
    empty () {
        return this.first === undefined;
    }
}

export class List<T> {
    private futureValues : FIFOList<(x: T) => void> = new FIFOList();
    private currentValues : FIFOList<T> = new FIFOList();
    pop (): Promise<T> {
        if (this.currentValues.empty()) {
            return new Promise<T>((resolve) => this.futureValues.push(resolve));
        }
        return Promise.resolve(this.currentValues.pop());
    }
    push (value: T) {
        if (this.futureValues.empty()) {
            this.currentValues.push(value);
        } else {
            this.futureValues.pop()(value);
        }
    }
}

