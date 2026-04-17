"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PathInFlightGate = void 0;
class PathInFlightGate {
    constructor() {
        this.inFlight = new Map();
    }
    async run(path, work) {
        const existing = this.inFlight.get(path);
        if (existing) {
            await existing;
            return false;
        }
        const pending = (async () => {
            await work();
        })();
        this.inFlight.set(path, pending);
        try {
            await pending;
            return true;
        }
        finally {
            if (this.inFlight.get(path) === pending) {
                this.inFlight.delete(path);
            }
        }
    }
}
exports.PathInFlightGate = PathInFlightGate;
