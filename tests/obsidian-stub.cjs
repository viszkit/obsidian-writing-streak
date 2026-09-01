const Module = require("node:module");

const originalLoad = Module._load;
class TFile {}

Module._load = function loadWithObsidianStub(request, parent, isMain) {
	if (request === "obsidian") {
		return { moment: require("moment"), TFile };
	}
	return originalLoad.call(this, request, parent, isMain);
};
