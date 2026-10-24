let chromeHandle;

function install(data, reason) {}

async function startup({ id, version, resourceURI, rootURI }, reason) {
	const aomStartup = Components.classes[
		"@mozilla.org/addons/addon-manager-startup;1"
	].getService(Components.interfaces.amIAddonManagerStartup);

	const manifestURI = Services.io.newURI(rootURI + "manifest.json");
	chromeHandle = aomStartup.registerChrome(manifestURI, [
		["content", "zys-theme", rootURI + "content/"],
	]);

	const ctx = {
		addonID: id,
		rootURI,
		Services,
	};
	ctx._globalThis = ctx;

	Services.scriptloader.loadSubScript(
		rootURI + "content/scripts/theme-manager.js",
		ctx
	);

	await ctx.ZoteroKThemeManager.hooks.onStartup();
}

async function onMainWindowLoad({ window }, reason) {
	await Zotero.ZoteroKThemeManager?.hooks.onMainWindowLoad(window);
}

async function onMainWindowUnload({ window }, reason) {
	await Zotero.ZoteroKThemeManager?.hooks.onMainWindowUnload(window);
}

async function shutdown({ id, version, resourceURI, rootURI }, reason) {
	if (reason === APP_SHUTDOWN) {
		return;
	}

	await Zotero.ZoteroKThemeManager?.hooks.onShutdown();

	if (chromeHandle) {
		chromeHandle.destruct();
		chromeHandle = null;
	}
}

async function uninstall(data, reason) {}
