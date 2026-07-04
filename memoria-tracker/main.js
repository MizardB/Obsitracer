var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => MemoriaTracker
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var fs = __toESM(require("fs"));
var os = __toESM(require("os"));
var path = __toESM(require("path"));
var MemoriaTracker = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.focusDebounceTimer = null;
    this.crudDebounceTimer = null;
    this.pendingChanges = /* @__PURE__ */ new Map();
    this.pendingIABlocks = [];
    this.activeFocus = null;
  }
  async onload() {
    console.log("Cargando Memoria Tracker plugin (Multi-Vault)...");
    this.vaultName = this.app.vault.getName();
    const baseDir = path.join(os.homedir(), ".config", "obsidian-copilot");
    this.focusPath = path.join(baseDir, "active_focus.json");
    this.crudMailboxPath = path.join(baseDir, "vaults", `${this.vaultName}.json`);
    const updateCursor = () => {
      const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
      if (view && view.file && view.editor) {
        const pos = view.editor.getCursor();
        const newFocus = { file: view.file.path, line: pos.line + 1, ch: pos.ch };
        if (!this.activeFocus || this.activeFocus.file !== newFocus.file || this.activeFocus.line !== newFocus.line || this.activeFocus.ch !== newFocus.ch) {
          this.activeFocus = newFocus;
          this.scheduleFocusUpdate();
        }
      }
    };
    this.registerDomEvent(document, "click", updateCursor);
    this.registerDomEvent(document, "keyup", updateCursor);
    this.registerDomEvent(window, "focus", updateCursor);
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        updateCursor();
      })
    );
    this.registerEvent(
      this.app.workspace.on("editor-change", (editor, view) => {
        if (view && view.file) {
          const pos = editor.getCursor();
          this.activeFocus = { file: view.file.path, line: pos.line + 1, ch: pos.ch };
          this.scheduleFocusUpdate();
        }
      })
    );
    this.registerEvent(
      this.app.workspace.on("file-open", (file) => {
        if (file) {
          const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
          if (view && view.editor) {
            const pos = view.editor.getCursor();
            this.activeFocus = { file: file.path, line: pos.line + 1, ch: pos.ch };
          } else {
            this.activeFocus = { file: file.path, line: 1, ch: 0 };
          }
          this.scheduleFocusUpdate();
        }
      })
    );
    this.registerEvent(this.app.vault.on("create", (file) => this.handleCrud("created", file)));
    this.registerEvent(this.app.vault.on("modify", (file) => this.handleCrud("modified", file)));
    this.registerEvent(this.app.vault.on("delete", (file) => this.handleCrud("deleted", file)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      this.pendingChanges.set(oldPath, { op: "deleted", path: oldPath });
      this.handleCrud("created", file);
      if (this.activeFocus && this.activeFocus.file === oldPath) {
        this.activeFocus.file = file.path;
        this.scheduleFocusUpdate();
      }
    }));
  }
  onunload() {
    console.log("Descargando Memoria Tracker plugin...");
    if (this.focusDebounceTimer) clearTimeout(this.focusDebounceTimer);
    if (this.crudDebounceTimer) clearTimeout(this.crudDebounceTimer);
  }
  async handleCrud(op, abstractFile) {
    if (this.shouldIgnore(abstractFile.path)) return;
    if (!(abstractFile instanceof import_obsidian.TFile)) return;
    const file = abstractFile;
    let excerpt = "";
    if (op === "created" || op === "modified") {
      try {
        const content = await this.app.vault.cachedRead(file);
        excerpt = content.length > 300 ? content.substring(0, 300) + "..." : content;
        if (op === "modified") {
          this.extractIABlocks(file.path, content);
        }
      } catch (e) {
      }
    }
    this.pendingChanges.set(file.path, { op, path: file.path, excerpt });
    this.scheduleCrudUpdate();
  }
  extractIABlocks(filePath, content) {
    const lines = content.split("\n");
    const regex = /\/ia\(['"]([^'"]+)['"]\)/;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(regex);
      if (m && m.length > 1) {
        this.pendingIABlocks.push({ file: filePath, line: i + 1, prompt: m[1] });
      }
    }
  }
  shouldIgnore(filePath) {
    const parts = filePath.split("/");
    if (parts.includes(".obsidian") || parts.includes(".git") || parts.includes(".trash")) return true;
    const base = path.basename(filePath);
    if (base.startsWith(".") || base.endsWith("~") || base.endsWith(".tmp")) return true;
    if (!base.endsWith(".md")) return true;
    return false;
  }
  scheduleFocusUpdate() {
    if (this.focusDebounceTimer) clearTimeout(this.focusDebounceTimer);
    this.focusDebounceTimer = setTimeout(() => this.flushFocus(), 100);
  }
  scheduleCrudUpdate() {
    if (this.crudDebounceTimer) clearTimeout(this.crudDebounceTimer);
    this.crudDebounceTimer = setTimeout(() => this.flushCrud(), 500);
  }
  flushFocus() {
    try {
      if (!this.activeFocus) return;
      const payload = {
        ts: (/* @__PURE__ */ new Date()).toISOString(),
        vault: this.vaultName,
        vaultPath: this.app.vault.adapter.basePath || "",
        focus: this.activeFocus
      };
      fs.mkdirSync(path.dirname(this.focusPath), { recursive: true });
      fs.writeFileSync(this.focusPath, JSON.stringify(payload, null, 2), "utf8");
    } catch (e) {
      console.error("Error actualizando focus:", e);
    }
  }
  flushCrud() {
    try {
      let data = { ts: (/* @__PURE__ */ new Date()).toISOString(), vault: "", changes: [], ia_blocks: [] };
      if (fs.existsSync(this.crudMailboxPath)) {
        try {
          data = JSON.parse(fs.readFileSync(this.crudMailboxPath, "utf8"));
        } catch (e) {
        }
      }
      const mergedChanges = [...data.changes || []];
      for (const change of this.pendingChanges.values()) {
        mergedChanges.push(change);
      }
      const mergedBlocks = [...data.ia_blocks || [], ...this.pendingIABlocks];
      const payload = {
        ts: (/* @__PURE__ */ new Date()).toISOString(),
        vault: this.app.vault.adapter.basePath || "",
        changes: mergedChanges,
        ia_blocks: mergedBlocks
      };
      fs.mkdirSync(path.dirname(this.crudMailboxPath), { recursive: true });
      fs.writeFileSync(this.crudMailboxPath, JSON.stringify(payload, null, 2), "utf8");
      this.pendingChanges.clear();
      this.pendingIABlocks = [];
    } catch (err) {
      console.error("Error escribiendo al buz\xF3n CRUD:", err);
    }
  }
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsibWFpbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiaW1wb3J0IHsgUGx1Z2luLCBFZGl0b3IsIE1hcmtkb3duVmlldywgVEZpbGUsIFRBYnN0cmFjdEZpbGUgfSBmcm9tICdvYnNpZGlhbic7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBvcyBmcm9tICdvcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBNZW1vcmlhVHJhY2tlciBleHRlbmRzIFBsdWdpbiB7XG5cdHByaXZhdGUgZm9jdXNEZWJvdW5jZVRpbWVyOiBOb2RlSlMuVGltZW91dCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIGNydWREZWJvdW5jZVRpbWVyOiBOb2RlSlMuVGltZW91dCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIGZvY3VzUGF0aDogc3RyaW5nO1xuXHRwcml2YXRlIGNydWRNYWlsYm94UGF0aDogc3RyaW5nO1xuXHRwcml2YXRlIHZhdWx0TmFtZTogc3RyaW5nO1xuXHRwcml2YXRlIHBlbmRpbmdDaGFuZ2VzOiBNYXA8c3RyaW5nLCBhbnk+ID0gbmV3IE1hcCgpO1xuXHRwcml2YXRlIHBlbmRpbmdJQUJsb2NrczogYW55W10gPSBbXTtcblx0cHJpdmF0ZSBhY3RpdmVGb2N1czogYW55ID0gbnVsbDtcblxuXHRhc3luYyBvbmxvYWQoKSB7XG5cdFx0Y29uc29sZS5sb2coJ0NhcmdhbmRvIE1lbW9yaWEgVHJhY2tlciBwbHVnaW4gKE11bHRpLVZhdWx0KS4uLicpO1xuXHRcdFxuXHRcdHRoaXMudmF1bHROYW1lID0gdGhpcy5hcHAudmF1bHQuZ2V0TmFtZSgpO1xuXHRcdGNvbnN0IGJhc2VEaXIgPSBwYXRoLmpvaW4ob3MuaG9tZWRpcigpLCAnLmNvbmZpZycsICdvYnNpZGlhbi1jb3BpbG90Jyk7XG5cdFx0dGhpcy5mb2N1c1BhdGggPSBwYXRoLmpvaW4oYmFzZURpciwgJ2FjdGl2ZV9mb2N1cy5qc29uJyk7XG5cdFx0dGhpcy5jcnVkTWFpbGJveFBhdGggPSBwYXRoLmpvaW4oYmFzZURpciwgJ3ZhdWx0cycsIGAke3RoaXMudmF1bHROYW1lfS5qc29uYCk7XG5cblx0XHQvLyBDdXJzb3IgdHJhY2tpbmdcblx0XHRjb25zdCB1cGRhdGVDdXJzb3IgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCB2aWV3ID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZVZpZXdPZlR5cGUoTWFya2Rvd25WaWV3KTtcblx0XHRcdGlmICh2aWV3ICYmIHZpZXcuZmlsZSAmJiB2aWV3LmVkaXRvcikge1xuXHRcdFx0XHRjb25zdCBwb3MgPSB2aWV3LmVkaXRvci5nZXRDdXJzb3IoKTtcblx0XHRcdFx0Y29uc3QgbmV3Rm9jdXMgPSB7IGZpbGU6IHZpZXcuZmlsZS5wYXRoLCBsaW5lOiBwb3MubGluZSArIDEsIGNoOiBwb3MuY2ggfTtcblx0XHRcdFx0aWYgKCF0aGlzLmFjdGl2ZUZvY3VzIHx8IFxuXHRcdFx0XHRcdHRoaXMuYWN0aXZlRm9jdXMuZmlsZSAhPT0gbmV3Rm9jdXMuZmlsZSB8fCBcblx0XHRcdFx0XHR0aGlzLmFjdGl2ZUZvY3VzLmxpbmUgIT09IG5ld0ZvY3VzLmxpbmUgfHwgXG5cdFx0XHRcdFx0dGhpcy5hY3RpdmVGb2N1cy5jaCAhPT0gbmV3Rm9jdXMuY2gpIHtcblx0XHRcdFx0XHR0aGlzLmFjdGl2ZUZvY3VzID0gbmV3Rm9jdXM7XG5cdFx0XHRcdFx0dGhpcy5zY2hlZHVsZUZvY3VzVXBkYXRlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dGhpcy5yZWdpc3RlckRvbUV2ZW50KGRvY3VtZW50LCAnY2xpY2snLCB1cGRhdGVDdXJzb3IpO1xuXHRcdHRoaXMucmVnaXN0ZXJEb21FdmVudChkb2N1bWVudCwgJ2tleXVwJywgdXBkYXRlQ3Vyc29yKTtcblx0XHR0aGlzLnJlZ2lzdGVyRG9tRXZlbnQod2luZG93LCAnZm9jdXMnLCB1cGRhdGVDdXJzb3IpO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV2ZW50KFxuXHRcdFx0dGhpcy5hcHAud29ya3NwYWNlLm9uKCdhY3RpdmUtbGVhZi1jaGFuZ2UnLCAoKSA9PiB7XG5cdFx0XHRcdHVwZGF0ZUN1cnNvcigpO1xuXHRcdFx0fSlcblx0XHQpO1xuXG5cdFx0dGhpcy5yZWdpc3RlckV2ZW50KFxuXHRcdFx0dGhpcy5hcHAud29ya3NwYWNlLm9uKCdlZGl0b3ItY2hhbmdlJywgKGVkaXRvcjogRWRpdG9yLCB2aWV3OiBNYXJrZG93blZpZXcpID0+IHtcblx0XHRcdFx0aWYgKHZpZXcgJiYgdmlldy5maWxlKSB7XG5cdFx0XHRcdFx0Y29uc3QgcG9zID0gZWRpdG9yLmdldEN1cnNvcigpO1xuXHRcdFx0XHRcdHRoaXMuYWN0aXZlRm9jdXMgPSB7IGZpbGU6IHZpZXcuZmlsZS5wYXRoLCBsaW5lOiBwb3MubGluZSArIDEsIGNoOiBwb3MuY2ggfTtcblx0XHRcdFx0XHR0aGlzLnNjaGVkdWxlRm9jdXNVcGRhdGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSlcblx0XHQpO1xuXHRcdHRoaXMucmVnaXN0ZXJFdmVudChcblx0XHRcdHRoaXMuYXBwLndvcmtzcGFjZS5vbignZmlsZS1vcGVuJywgKGZpbGU6IFRGaWxlIHwgbnVsbCkgPT4ge1xuXHRcdFx0XHRpZiAoZmlsZSkge1xuXHRcdFx0XHRcdGNvbnN0IHZpZXcgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlVmlld09mVHlwZShNYXJrZG93blZpZXcpO1xuXHRcdFx0XHRcdGlmICh2aWV3ICYmIHZpZXcuZWRpdG9yKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBwb3MgPSB2aWV3LmVkaXRvci5nZXRDdXJzb3IoKTtcblx0XHRcdFx0XHRcdHRoaXMuYWN0aXZlRm9jdXMgPSB7IGZpbGU6IGZpbGUucGF0aCwgbGluZTogcG9zLmxpbmUgKyAxLCBjaDogcG9zLmNoIH07XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuYWN0aXZlRm9jdXMgPSB7IGZpbGU6IGZpbGUucGF0aCwgbGluZTogMSwgY2g6IDAgfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5zY2hlZHVsZUZvY3VzVXBkYXRlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pXG5cdFx0KTtcblxuXHRcdC8vIENSVUQgdHJhY2tpbmdcblx0XHR0aGlzLnJlZ2lzdGVyRXZlbnQodGhpcy5hcHAudmF1bHQub24oJ2NyZWF0ZScsIChmaWxlOiBUQWJzdHJhY3RGaWxlKSA9PiB0aGlzLmhhbmRsZUNydWQoJ2NyZWF0ZWQnLCBmaWxlKSkpO1xuXHRcdHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbignbW9kaWZ5JywgKGZpbGU6IFRBYnN0cmFjdEZpbGUpID0+IHRoaXMuaGFuZGxlQ3J1ZCgnbW9kaWZpZWQnLCBmaWxlKSkpO1xuXHRcdHRoaXMucmVnaXN0ZXJFdmVudCh0aGlzLmFwcC52YXVsdC5vbignZGVsZXRlJywgKGZpbGU6IFRBYnN0cmFjdEZpbGUpID0+IHRoaXMuaGFuZGxlQ3J1ZCgnZGVsZXRlZCcsIGZpbGUpKSk7XG5cdFx0dGhpcy5yZWdpc3RlckV2ZW50KHRoaXMuYXBwLnZhdWx0Lm9uKCdyZW5hbWUnLCAoZmlsZTogVEFic3RyYWN0RmlsZSwgb2xkUGF0aDogc3RyaW5nKSA9PiB7XG5cdFx0XHR0aGlzLnBlbmRpbmdDaGFuZ2VzLnNldChvbGRQYXRoLCB7IG9wOiAnZGVsZXRlZCcsIHBhdGg6IG9sZFBhdGggfSk7XG5cdFx0XHR0aGlzLmhhbmRsZUNydWQoJ2NyZWF0ZWQnLCBmaWxlKTtcblx0XHRcdGlmICh0aGlzLmFjdGl2ZUZvY3VzICYmIHRoaXMuYWN0aXZlRm9jdXMuZmlsZSA9PT0gb2xkUGF0aCkge1xuXHRcdFx0XHR0aGlzLmFjdGl2ZUZvY3VzLmZpbGUgPSBmaWxlLnBhdGg7XG5cdFx0XHRcdHRoaXMuc2NoZWR1bGVGb2N1c1VwZGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdG9udW5sb2FkKCkge1xuXHRcdGNvbnNvbGUubG9nKCdEZXNjYXJnYW5kbyBNZW1vcmlhIFRyYWNrZXIgcGx1Z2luLi4uJyk7XG5cdFx0aWYgKHRoaXMuZm9jdXNEZWJvdW5jZVRpbWVyKSBjbGVhclRpbWVvdXQodGhpcy5mb2N1c0RlYm91bmNlVGltZXIpO1xuXHRcdGlmICh0aGlzLmNydWREZWJvdW5jZVRpbWVyKSBjbGVhclRpbWVvdXQodGhpcy5jcnVkRGVib3VuY2VUaW1lcik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGhhbmRsZUNydWQob3A6IHN0cmluZywgYWJzdHJhY3RGaWxlOiBUQWJzdHJhY3RGaWxlKSB7XG5cdFx0aWYgKHRoaXMuc2hvdWxkSWdub3JlKGFic3RyYWN0RmlsZS5wYXRoKSkgcmV0dXJuO1xuXHRcdGlmICghKGFic3RyYWN0RmlsZSBpbnN0YW5jZW9mIFRGaWxlKSkgcmV0dXJuO1xuXG5cdFx0Y29uc3QgZmlsZSA9IGFic3RyYWN0RmlsZSBhcyBURmlsZTtcblx0XHRsZXQgZXhjZXJwdCA9ICcnO1xuXG5cdFx0aWYgKG9wID09PSAnY3JlYXRlZCcgfHwgb3AgPT09ICdtb2RpZmllZCcpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5jYWNoZWRSZWFkKGZpbGUpO1xuXHRcdFx0XHRleGNlcnB0ID0gY29udGVudC5sZW5ndGggPiAzMDAgPyBjb250ZW50LnN1YnN0cmluZygwLCAzMDApICsgJy4uLicgOiBjb250ZW50O1xuXHRcdFx0XHRcblx0XHRcdFx0aWYgKG9wID09PSAnbW9kaWZpZWQnKSB7XG5cdFx0XHRcdFx0dGhpcy5leHRyYWN0SUFCbG9ja3MoZmlsZS5wYXRoLCBjb250ZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaChlKSB7fVxuXHRcdH1cblxuXHRcdHRoaXMucGVuZGluZ0NoYW5nZXMuc2V0KGZpbGUucGF0aCwgeyBvcCwgcGF0aDogZmlsZS5wYXRoLCBleGNlcnB0IH0pO1xuXHRcdHRoaXMuc2NoZWR1bGVDcnVkVXBkYXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIGV4dHJhY3RJQUJsb2NrcyhmaWxlUGF0aDogc3RyaW5nLCBjb250ZW50OiBzdHJpbmcpIHtcblx0XHRjb25zdCBsaW5lcyA9IGNvbnRlbnQuc3BsaXQoJ1xcbicpO1xuXHRcdGNvbnN0IHJlZ2V4ID0gL1xcL2lhXFwoWydcIl0oW14nXCJdKylbJ1wiXVxcKS87XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBsaW5lcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgbSA9IGxpbmVzW2ldLm1hdGNoKHJlZ2V4KTtcblx0XHRcdGlmIChtICYmIG0ubGVuZ3RoID4gMSkge1xuXHRcdFx0XHR0aGlzLnBlbmRpbmdJQUJsb2Nrcy5wdXNoKHsgZmlsZTogZmlsZVBhdGgsIGxpbmU6IGkgKyAxLCBwcm9tcHQ6IG1bMV0gfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRJZ25vcmUoZmlsZVBhdGg6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHBhcnRzID0gZmlsZVBhdGguc3BsaXQoJy8nKTtcblx0XHRpZiAocGFydHMuaW5jbHVkZXMoJy5vYnNpZGlhbicpIHx8IHBhcnRzLmluY2x1ZGVzKCcuZ2l0JykgfHwgcGFydHMuaW5jbHVkZXMoJy50cmFzaCcpKSByZXR1cm4gdHJ1ZTtcblx0XHRjb25zdCBiYXNlID0gcGF0aC5iYXNlbmFtZShmaWxlUGF0aCk7XG5cdFx0aWYgKGJhc2Uuc3RhcnRzV2l0aCgnLicpIHx8IGJhc2UuZW5kc1dpdGgoJ34nKSB8fCBiYXNlLmVuZHNXaXRoKCcudG1wJykpIHJldHVybiB0cnVlO1xuXHRcdGlmICghYmFzZS5lbmRzV2l0aCgnLm1kJykpIHJldHVybiB0cnVlO1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgc2NoZWR1bGVGb2N1c1VwZGF0ZSgpIHtcblx0XHRpZiAodGhpcy5mb2N1c0RlYm91bmNlVGltZXIpIGNsZWFyVGltZW91dCh0aGlzLmZvY3VzRGVib3VuY2VUaW1lcik7XG5cdFx0dGhpcy5mb2N1c0RlYm91bmNlVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHRoaXMuZmx1c2hGb2N1cygpLCAxMDApO1xuXHR9XG5cblx0cHJpdmF0ZSBzY2hlZHVsZUNydWRVcGRhdGUoKSB7XG5cdFx0aWYgKHRoaXMuY3J1ZERlYm91bmNlVGltZXIpIGNsZWFyVGltZW91dCh0aGlzLmNydWREZWJvdW5jZVRpbWVyKTtcblx0XHR0aGlzLmNydWREZWJvdW5jZVRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB0aGlzLmZsdXNoQ3J1ZCgpLCA1MDApO1xuXHR9XG5cblx0cHJpdmF0ZSBmbHVzaEZvY3VzKCkge1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAoIXRoaXMuYWN0aXZlRm9jdXMpIHJldHVybjtcblx0XHRcdFxuXHRcdFx0Y29uc3QgcGF5bG9hZCA9IHtcblx0XHRcdFx0dHM6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0dmF1bHQ6IHRoaXMudmF1bHROYW1lLFxuXHRcdFx0XHR2YXVsdFBhdGg6ICh0aGlzLmFwcC52YXVsdC5hZGFwdGVyIGFzIGFueSkuYmFzZVBhdGggfHwgJycsXG5cdFx0XHRcdGZvY3VzOiB0aGlzLmFjdGl2ZUZvY3VzXG5cdFx0XHR9O1xuXHRcdFx0XG5cdFx0XHRmcy5ta2RpclN5bmMocGF0aC5kaXJuYW1lKHRoaXMuZm9jdXNQYXRoKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHRmcy53cml0ZUZpbGVTeW5jKHRoaXMuZm9jdXNQYXRoLCBKU09OLnN0cmluZ2lmeShwYXlsb2FkLCBudWxsLCAyKSwgJ3V0ZjgnKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKCdFcnJvciBhY3R1YWxpemFuZG8gZm9jdXM6JywgZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBmbHVzaENydWQoKSB7XG5cdFx0dHJ5IHtcblx0XHRcdGxldCBkYXRhID0geyB0czogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLCB2YXVsdDogJycsIGNoYW5nZXM6IFtdIGFzIGFueVtdLCBpYV9ibG9ja3M6IFtdIGFzIGFueVtdIH07XG5cdFx0XHRcblx0XHRcdGlmIChmcy5leGlzdHNTeW5jKHRoaXMuY3J1ZE1haWxib3hQYXRoKSkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGRhdGEgPSBKU09OLnBhcnNlKGZzLnJlYWRGaWxlU3luYyh0aGlzLmNydWRNYWlsYm94UGF0aCwgJ3V0ZjgnKSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHt9XG5cdFx0XHR9XG5cblx0XHRcdC8vIE1lcmdlIGNoYW5nZXNcblx0XHRcdGNvbnN0IG1lcmdlZENoYW5nZXMgPSBbLi4uKGRhdGEuY2hhbmdlcyB8fCBbXSldO1xuXHRcdFx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgdGhpcy5wZW5kaW5nQ2hhbmdlcy52YWx1ZXMoKSkge1xuXHRcdFx0XHRtZXJnZWRDaGFuZ2VzLnB1c2goY2hhbmdlKTtcblx0XHRcdH1cblx0XHRcdFxuXHRcdFx0Ly8gTWVyZ2UgYmxvY2tzXG5cdFx0XHRjb25zdCBtZXJnZWRCbG9ja3MgPSBbLi4uKGRhdGEuaWFfYmxvY2tzIHx8IFtdKSwgLi4udGhpcy5wZW5kaW5nSUFCbG9ja3NdO1xuXG5cdFx0XHRjb25zdCBwYXlsb2FkID0ge1xuXHRcdFx0XHR0czogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHR2YXVsdDogKHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIgYXMgYW55KS5iYXNlUGF0aCB8fCAnJyxcblx0XHRcdFx0Y2hhbmdlczogbWVyZ2VkQ2hhbmdlcyxcblx0XHRcdFx0aWFfYmxvY2tzOiBtZXJnZWRCbG9ja3Ncblx0XHRcdH07XG5cblx0XHRcdGZzLm1rZGlyU3luYyhwYXRoLmRpcm5hbWUodGhpcy5jcnVkTWFpbGJveFBhdGgpLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0XHRcdGZzLndyaXRlRmlsZVN5bmModGhpcy5jcnVkTWFpbGJveFBhdGgsIEpTT04uc3RyaW5naWZ5KHBheWxvYWQsIG51bGwsIDIpLCAndXRmOCcpO1xuXG5cdFx0XHQvLyBDbGVhciBwZW5kaW5nXG5cdFx0XHR0aGlzLnBlbmRpbmdDaGFuZ2VzLmNsZWFyKCk7XG5cdFx0XHR0aGlzLnBlbmRpbmdJQUJsb2NrcyA9IFtdO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Y29uc29sZS5lcnJvcignRXJyb3IgZXNjcmliaWVuZG8gYWwgYnV6XHUwMEYzbiBDUlVEOicsIGVycik7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxzQkFBbUU7QUFDbkUsU0FBb0I7QUFDcEIsU0FBb0I7QUFDcEIsV0FBc0I7QUFFdEIsSUFBcUIsaUJBQXJCLGNBQTRDLHVCQUFPO0FBQUEsRUFBbkQ7QUFBQTtBQUNDLFNBQVEscUJBQTRDO0FBQ3BELFNBQVEsb0JBQTJDO0FBSW5ELFNBQVEsaUJBQW1DLG9CQUFJLElBQUk7QUFDbkQsU0FBUSxrQkFBeUIsQ0FBQztBQUNsQyxTQUFRLGNBQW1CO0FBQUE7QUFBQSxFQUUzQixNQUFNLFNBQVM7QUFDZCxZQUFRLElBQUksa0RBQWtEO0FBRTlELFNBQUssWUFBWSxLQUFLLElBQUksTUFBTSxRQUFRO0FBQ3hDLFVBQU0sVUFBZSxVQUFRLFdBQVEsR0FBRyxXQUFXLGtCQUFrQjtBQUNyRSxTQUFLLFlBQWlCLFVBQUssU0FBUyxtQkFBbUI7QUFDdkQsU0FBSyxrQkFBdUIsVUFBSyxTQUFTLFVBQVUsR0FBRyxLQUFLLFNBQVMsT0FBTztBQUc1RSxVQUFNLGVBQWUsTUFBTTtBQUMxQixZQUFNLE9BQU8sS0FBSyxJQUFJLFVBQVUsb0JBQW9CLDRCQUFZO0FBQ2hFLFVBQUksUUFBUSxLQUFLLFFBQVEsS0FBSyxRQUFRO0FBQ3JDLGNBQU0sTUFBTSxLQUFLLE9BQU8sVUFBVTtBQUNsQyxjQUFNLFdBQVcsRUFBRSxNQUFNLEtBQUssS0FBSyxNQUFNLE1BQU0sSUFBSSxPQUFPLEdBQUcsSUFBSSxJQUFJLEdBQUc7QUFD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
