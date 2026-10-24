var ZoteroKThemeManager = {
	addonID,
	rootURI,
	MENU_ID: "zotero-k-theme-manager-menu",
	MENU_POPUP_ID: "zotero-k-theme-manager-popup",
	MENU_OVERLAY_ID: "zotero-k-theme-manager-overlay",
	MENU_RESTART_ID: "zotero-k-theme-manager-restart",
	NATIVE_THEME_PREF: "browser.theme.toolbar-theme",
	LEGACY_USERCHROME_PREF: "toolkit.legacyUserProfileCustomizations.stylesheets",
	PREF_PREV_UI_DENSITY: "zoteroKThemeManager.previousUIDensity",
	PREF_PREV_FONT_SIZE: "zoteroKThemeManager.previousFontSize",
	PREF_PREV_USERCHROME_BACKUP: "zoteroKThemeManager.previousUserChromeBackup",
	USERCHROME_MARKER: "Zotero-K userChrome theme",
	PREF_BLOCK_BEGIN: "/* Zotero-K Ulm theme begin */",
	PREF_BLOCK_END: "/* Zotero-K Ulm theme end */",
	MANAGED_UI_DENSITY: "compact",
	MANAGED_FONT_SIZE: "0.92",
	DEFAULT_UI_DENSITY: "comfortable",
	DEFAULT_FONT_SIZE: "1.00",
	MENU_RETRY_MS: 250,
	WINDOW_SCAN_MS: 250,
	WINDOW_SCAN_LIMIT: 80,
	windows: new Map(),
	windowScanTimer: null,
	windowScanTimerWindow: null,
	windowScanAttempts: 0,
	restartNeeded: false,
	busy: false,

	hooks: {
		onStartup: async () => {
			Zotero.ZoteroKThemeManager = ZoteroKThemeManager;
			ZoteroKThemeManager.restartNeeded = false;
			ZoteroKThemeManager.startWindowScan();
		},

		onMainWindowLoad: async (win) => {
			ZoteroKThemeManager.patchWindow(win);
		},

		onMainWindowUnload: async (win) => {
			ZoteroKThemeManager.unpatchWindow(win);
		},

		onShutdown: async () => {
			ZoteroKThemeManager.stopWindowScan();
			for (const win of Array.from(ZoteroKThemeManager.windows.keys())) {
				ZoteroKThemeManager.unpatchWindow(win);
			}
			delete Zotero.ZoteroKThemeManager;
		},
	},

	startWindowScan() {
		this.patchExistingWindows();
		if (this.hasInstalledMenu() || this.windowScanTimer) {
			return;
		}
		const timerWindow = this.getTimerWindow();
		this.windowScanAttempts = 0;
		this.windowScanTimerWindow = timerWindow;
		this.windowScanTimer = timerWindow.setInterval(() => {
			this.windowScanAttempts++;
			this.patchExistingWindows();
			if (this.hasInstalledMenu() || this.windowScanAttempts >= this.WINDOW_SCAN_LIMIT) {
				this.stopWindowScan();
			}
		}, this.WINDOW_SCAN_MS);
	},

	stopWindowScan() {
		if (!this.windowScanTimer) {
			return;
		}
		(this.windowScanTimerWindow || this.getTimerWindow()).clearInterval(this.windowScanTimer);
		this.windowScanTimer = null;
		this.windowScanTimerWindow = null;
	},

	getTimerWindow() {
		return Zotero.getMainWindow?.()
			|| Services.wm.getMostRecentWindow("navigator:browser")
			|| globalThis;
	},

	patchExistingWindows() {
		const mainWindow = Zotero.getMainWindow?.();
		if (mainWindow) {
			this.patchWindow(mainWindow);
		}
		const enumerator = Services.wm.getEnumerator(null);
		while (enumerator.hasMoreElements()) {
			const win = enumerator.getNext();
			if (win?.document?.documentElement) {
				this.patchWindow(win);
			}
		}
	},

	hasInstalledMenu() {
		for (const state of this.windows.values()) {
			if (state.menu?.isConnected) {
				return true;
			}
		}
		return false;
	},

	patchWindow(win) {
		let state = this.windows.get(win);
		if (!state) {
			state = {
				listeners: [],
				nativeItems: new Map(),
				menuRetryTimer: null,
			};
			this.windows.set(win, state);
		}
		if (state.menu?.isConnected) {
			return;
		}
		this.installViewMenu(win, state);
		this.refreshMenu(win).catch((err) => this.handleError(win, err));
	},

	unpatchWindow(win) {
		const state = this.windows.get(win);
		if (!state) {
			return;
		}
		for (const { target, type, handler } of state.listeners) {
			target.removeEventListener(type, handler);
		}
		if (state.menuRetryTimer) {
			win.clearTimeout(state.menuRetryTimer);
		}
		state.menu?.remove();
		state.separator?.remove();
		this.windows.delete(win);
	},

	installViewMenu(win, state) {
		const doc = win.document;
		doc.getElementById(this.MENU_ID)?.remove();
		doc.getElementById("zotero-k-theme-manager-separator")?.remove();

		const viewPopup = doc.getElementById("menu_viewPopup");
		if (!viewPopup) {
			if (!state.menuRetryTimer) {
				state.menuRetryTimer = win.setTimeout(() => {
					state.menuRetryTimer = null;
					this.installViewMenu(win, state);
					this.refreshMenu(win).catch((err) => this.handleError(win, err));
				}, this.MENU_RETRY_MS);
			}
			return;
		}

		const separator = doc.createXULElement("menuseparator");
		separator.id = "zotero-k-theme-manager-separator";

		const menu = doc.createXULElement("menu");
		menu.id = this.MENU_ID;
		menu.setAttribute("label", "Quiet Theme");

		const popup = doc.createXULElement("menupopup");
		popup.id = this.MENU_POPUP_ID;
		menu.appendChild(popup);

		for (const theme of [
			{ label: "Automatic", value: 2 },
			{ label: "Light", value: 1 },
			{ label: "Dark", value: 0 },
		]) {
			const item = this.createMenuItem(doc, {
				id: `zotero-k-theme-manager-native-${theme.value}`,
				label: theme.label,
				type: "radio",
				name: "zotero-k-theme-manager-native",
			});
			const handler = () => {
				this.setNativeTheme(theme.value);
				this.refreshAllMenus();
			};
			this.addListener(state, item, "command", handler);
			state.nativeItems.set(theme.value, item);
			popup.appendChild(item);
		}

		popup.appendChild(doc.createXULElement("menuseparator"));

		const overlayItem = this.createMenuItem(doc, {
			id: this.MENU_OVERLAY_ID,
			label: "Quiet Overlay",
			type: "checkbox",
		});
		const overlayHandler = () => {
			this.toggleOverlay(win).catch((err) => this.handleError(win, err));
		};
		this.addListener(state, overlayItem, "command", overlayHandler);
		state.overlayItem = overlayItem;
		popup.appendChild(overlayItem);

		const restartItem = this.createMenuItem(doc, {
			id: this.MENU_RESTART_ID,
			label: "Restart Zotero",
		});
		const restartHandler = () => this.restartZotero(win);
		this.addListener(state, restartItem, "command", restartHandler);
		state.restartItem = restartItem;
		popup.appendChild(restartItem);

		const refreshHandler = () => {
			this.refreshMenu(win).catch((err) => this.handleError(win, err));
		};
		this.addListener(state, popup, "popupshowing", refreshHandler);

		const anchor = doc.getElementById("density-menu") || doc.getElementById("font-size-menu");
		if (anchor?.parentNode === viewPopup) {
			viewPopup.insertBefore(separator, anchor);
			viewPopup.insertBefore(menu, anchor);
		}
		else {
			viewPopup.appendChild(separator);
			viewPopup.appendChild(menu);
		}

		state.separator = separator;
		state.menu = menu;
	},

	createMenuItem(doc, attrs) {
		const item = doc.createXULElement("menuitem");
		for (const [key, value] of Object.entries(attrs)) {
			item.setAttribute(key, String(value));
		}
		return item;
	},

	addListener(state, target, type, handler) {
		target.addEventListener(type, handler);
		state.listeners.push({ target, type, handler });
	},

	async refreshAllMenus() {
		for (const win of this.windows.keys()) {
			await this.refreshMenu(win).catch((err) => this.handleError(win, err));
		}
	},

	async refreshMenu(win) {
		const state = this.windows.get(win);
		if (!state) {
			return;
		}

		const nativeValue = this.getNativeTheme();
		for (const [value, item] of state.nativeItems) {
			this.setChecked(item, value === nativeValue);
		}

		const overlayStatus = await this.getOverlayStatus();
		this.setChecked(state.overlayItem, overlayStatus === "managed");
		this.setDisabled(state.overlayItem, this.busy);
		this.setDisabled(state.restartItem, !this.restartNeeded || this.busy);
	},

	getNativeTheme() {
		try {
			return Services.prefs.getIntPref(this.NATIVE_THEME_PREF, 2);
		}
		catch (_) {
			return 2;
		}
	},

	setNativeTheme(value) {
		Services.prefs.setIntPref(this.NATIVE_THEME_PREF, value);
	},

	async toggleOverlay(win) {
		if (this.busy) {
			return;
		}
		this.busy = true;
		await this.refreshAllMenus();
		try {
			const status = await this.getOverlayStatus();
			if (status === "managed") {
				await this.disableOverlay();
				this.notify(win, "Restart Zotero to unload the Quiet Theme.");
			}
			else {
				await this.enableOverlay();
				this.notify(win, "Restart Zotero to load the Quiet Theme.");
			}
			this.restartNeeded = true;
		}
		finally {
			this.busy = false;
			await this.refreshAllMenus();
		}
	},

	async enableOverlay() {
		const paths = this.getProfilePaths();
		await Zotero.File.createDirectoryIfMissingAsync(paths.chromeDir);

		const current = await this.readTextIfExists(paths.userChrome);
		if (current && !current.includes(this.USERCHROME_MARKER)) {
			const backupPath = `${paths.userChrome}.backup.${this.timestamp()}`;
			await Zotero.File.putContentsAsync(backupPath, current);
			Zotero.Prefs.set(this.PREF_PREV_USERCHROME_BACKUP, backupPath);
		}

		this.savePreviousRuntimePrefs();
		const css = await Zotero.File.getResourceAsync(
			rootURI + "content/theme/zotero-k.userChrome.css"
		);
		if (!css.includes(this.USERCHROME_MARKER)) {
			throw new Error("Bundled Quiet Theme is missing its safety marker.");
		}
		await Zotero.File.putContentsAsync(paths.userChrome, css);
		await this.writeManagedPrefsBlock(paths.userJS);
		this.applyManagedRuntimePrefs();
		Services.prefs.setBoolPref(this.LEGACY_USERCHROME_PREF, true);
	},

	async disableOverlay() {
		const paths = this.getProfilePaths();
		const current = await this.readTextIfExists(paths.userChrome);
		const backupPath = this.getStoredStringPref(this.PREF_PREV_USERCHROME_BACKUP);

		if (current?.includes(this.USERCHROME_MARKER)) {
			const backup = backupPath ? await this.readTextIfExists(backupPath) : "";
			if (backup) {
				await Zotero.File.putContentsAsync(paths.userChrome, backup);
			}
			else {
				await this.removeFileIfExists(paths.userChrome);
			}
		}

		await this.removeManagedPrefsBlock(paths.userJS);
		this.restoreRuntimePrefs();
		this.clearPluginPref(this.PREF_PREV_USERCHROME_BACKUP);
		await this.clearLegacyUserChromePrefIfUnused(paths);
	},

	getProfilePaths() {
		const pathUtils = this.getPathUtils();
		const profileDir = Zotero.Profile?.dir
			|| Services.dirsvc.get("ProfD", Components.interfaces.nsIFile).path;
		const chromeDir = pathUtils.join(profileDir, "chrome");
		return {
			profileDir,
			chromeDir,
			userChrome: pathUtils.join(chromeDir, "userChrome.css"),
			userContent: pathUtils.join(chromeDir, "userContent.css"),
			userJS: pathUtils.join(profileDir, "user.js"),
		};
	},

	getPathUtils() {
		if (typeof PathUtils !== "undefined") {
			return PathUtils;
		}
		return ChromeUtils.importESModule("resource://gre/modules/PathUtils.sys.mjs").PathUtils;
	},

	getIOUtils() {
		if (typeof IOUtils !== "undefined") {
			return IOUtils;
		}
		return ChromeUtils.importESModule("resource://gre/modules/IOUtils.sys.mjs").IOUtils;
	},

	async getOverlayStatus() {
		const paths = this.getProfilePaths();
		const contents = await this.readTextIfExists(paths.userChrome);
		if (!contents) {
			return "none";
		}
		return contents.includes(this.USERCHROME_MARKER) ? "managed" : "foreign";
	},

	async readTextIfExists(path) {
		const io = this.getIOUtils();
		if (!(await io.exists(path))) {
			return "";
		}
		return Zotero.File.getContentsAsync(path);
	},

	async removeFileIfExists(path) {
		const io = this.getIOUtils();
		if (await io.exists(path)) {
			await io.remove(path);
		}
	},

	async writeManagedPrefsBlock(userJS) {
		const current = await this.readTextIfExists(userJS);
		const stripped = this.stripManagedPrefsBlock(current).replace(/\s+$/u, "");
		const block = [
			this.PREF_BLOCK_BEGIN,
			`user_pref("${this.LEGACY_USERCHROME_PREF}", true);`,
			`user_pref("extensions.zotero.uiDensity", "${this.MANAGED_UI_DENSITY}");`,
			`user_pref("extensions.zotero.fontSize", "${this.MANAGED_FONT_SIZE}");`,
			this.PREF_BLOCK_END,
		].join("\n");
		const next = stripped ? `${stripped}\n\n${block}\n` : `${block}\n`;
		await Zotero.File.putContentsAsync(userJS, next);
	},

	async removeManagedPrefsBlock(userJS) {
		const current = await this.readTextIfExists(userJS);
		if (!current) {
			return;
		}
		const stripped = this.stripManagedPrefsBlock(current);
		if (stripped !== current) {
			await Zotero.File.putContentsAsync(userJS, stripped.replace(/\s+$/u, "") + "\n");
		}
	},

	stripManagedPrefsBlock(text) {
		const lines = text.split(/\r?\n/u);
		let skipping = false;
		const kept = [];
		for (const line of lines) {
			if (line.trim() === this.PREF_BLOCK_BEGIN) {
				skipping = true;
				continue;
			}
			if (line.trim() === this.PREF_BLOCK_END) {
				skipping = false;
				continue;
			}
			if (!skipping) {
				kept.push(line);
			}
		}
		return kept.join("\n");
	},

	savePreviousRuntimePrefs() {
		if (!Zotero.Prefs.prefHasUserValue(this.PREF_PREV_UI_DENSITY)) {
			Zotero.Prefs.set(
				this.PREF_PREV_UI_DENSITY,
				String(Zotero.Prefs.get("uiDensity") || this.DEFAULT_UI_DENSITY)
			);
		}
		if (!Zotero.Prefs.prefHasUserValue(this.PREF_PREV_FONT_SIZE)) {
			Zotero.Prefs.set(
				this.PREF_PREV_FONT_SIZE,
				String(Zotero.Prefs.get("fontSize") || this.DEFAULT_FONT_SIZE)
			);
		}
	},

	applyManagedRuntimePrefs() {
		Zotero.Prefs.set("uiDensity", this.MANAGED_UI_DENSITY);
		Zotero.Prefs.set("fontSize", this.MANAGED_FONT_SIZE);
	},

	restoreRuntimePrefs() {
		Zotero.Prefs.set(
			"uiDensity",
			this.getStoredStringPref(this.PREF_PREV_UI_DENSITY) || this.DEFAULT_UI_DENSITY
		);
		Zotero.Prefs.set(
			"fontSize",
			this.getStoredStringPref(this.PREF_PREV_FONT_SIZE) || this.DEFAULT_FONT_SIZE
		);
		this.clearPluginPref(this.PREF_PREV_UI_DENSITY);
		this.clearPluginPref(this.PREF_PREV_FONT_SIZE);
	},

	getStoredStringPref(pref) {
		if (!Zotero.Prefs.prefHasUserValue(pref)) {
			return "";
		}
		return String(Zotero.Prefs.get(pref) || "");
	},

	clearPluginPref(pref) {
		if (Zotero.Prefs.prefHasUserValue(pref)) {
			Zotero.Prefs.clear(pref);
		}
	},

	async clearLegacyUserChromePrefIfUnused(paths) {
		const io = this.getIOUtils();
		const hasUserChrome = await io.exists(paths.userChrome);
		const hasUserContent = await io.exists(paths.userContent);
		if (!hasUserChrome && !hasUserContent) {
			try {
				Services.prefs.clearUserPref(this.LEGACY_USERCHROME_PREF);
			}
			catch (_) {}
		}
	},

	restartZotero(win) {
		try {
			Services.startup.quit(
				Components.interfaces.nsIAppStartup.eAttemptQuit
				| Components.interfaces.nsIAppStartup.eRestart
			);
		}
		catch (err) {
			this.handleError(win, err);
		}
	},

	setChecked(item, checked) {
		if (!item) {
			return;
		}
		if (checked) {
			item.setAttribute("checked", "true");
		}
		else {
			item.removeAttribute("checked");
		}
	},

	setDisabled(item, disabled) {
		if (!item) {
			return;
		}
		if (disabled) {
			item.setAttribute("disabled", "true");
		}
		else {
			item.removeAttribute("disabled");
		}
	},

	notify(win, message) {
		try {
			Zotero.alert(win, "Quiet Theme", message);
		}
		catch (_) {
			win?.alert?.(message);
		}
	},

	handleError(win, err) {
		Zotero.logError(err);
		const message = err instanceof Error ? err.message : String(err);
		this.notify(win, message);
	},

	timestamp() {
		const date = new Date();
		const pad = (value) => String(value).padStart(2, "0");
		return [
			date.getFullYear(),
			pad(date.getMonth() + 1),
			pad(date.getDate()),
		].join("") + "-" + [
			pad(date.getHours()),
			pad(date.getMinutes()),
			pad(date.getSeconds()),
		].join("");
	},
};
