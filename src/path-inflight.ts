export class PathInFlightGate {
	private readonly inFlight = new Map<string, Promise<void>>();

	async run(path: string, work: () => Promise<void>): Promise<boolean> {
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
		} finally {
			if (this.inFlight.get(path) === pending) {
				this.inFlight.delete(path);
			}
		}
	}
}
