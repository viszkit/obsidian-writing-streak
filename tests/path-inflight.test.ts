import test from "node:test";
import assert from "node:assert/strict";
import { PathInFlightGate } from "../src/path-inflight";

test("concurrent initialization for the same path only runs the first task", async () => {
	const gate = new PathInFlightGate();
	let runs = 0;
	let releaseFirstRun = () => {};
	const firstRunPending = new Promise<void>((resolve) => {
		releaseFirstRun = resolve;
	});

	const first = gate.run("today.md", async () => {
		runs++;
		await firstRunPending;
	});
	const second = gate.run("today.md", async () => {
		runs++;
	});

	await Promise.resolve();
	assert.equal(runs, 1);

	releaseFirstRun();

	assert.equal(await first, true);
	assert.equal(await second, false);
	assert.equal(runs, 1);
});
