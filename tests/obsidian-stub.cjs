const Module = require("node:module");

const originalLoad = Module._load;

Module._load = function loadWithObsidianStub(request, parent, isMain) {
	if (request === "obsidian") {
		return { moment: require("moment") };
	}
	return originalLoad.call(this, request, parent, isMain);
};
