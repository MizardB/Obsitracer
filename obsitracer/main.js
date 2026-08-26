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
  default: () => Obsitracer
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var import_child_process = require("child_process");
var fs = __toESM(require("fs"));
var os = __toESM(require("os"));
var path = __toESM(require("path"));
var Obsitracer = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.focusDebounceTimer = null;
    this.crudDebounceTimer = null;
    this.pendingChanges = /* @__PURE__ */ new Map();
    this.pendingIABlocks = [];
    this.activeFocus = null;
  }
  async onload() {
    console.log("Cargando Obsitracer plugin (Multi-Vault)...");
    this.vaultName = this.app.vault.getName();
    const baseDir = path.join(os.homedir(), ".config", "obsitracer");
    const vaultDir = path.join(baseDir, "vaults", this.vaultName);
    this.focusPath = path.join(vaultDir, "focus.json");
    this.crudMailboxPath = path.join(vaultDir, "crud.json");
    this.registerVaultToList();
    const updateCursor = () => {
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile) {
        let line = 1;
        let ch = 0;
        const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
        if (view && view.file && view.file.path === activeFile.path && view.editor) {
          const pos = view.editor.getCursor();
          line = pos.line + 1;
          ch = pos.ch;
        }
        this.activeFocus = { file: activeFile.path, line, ch };
      }
      this.scheduleFocusUpdate();
    };
    const scheduleUpdate = () => {
      setTimeout(updateCursor, 100);
    };
    this.registerDomEvent(document, "mousedown", scheduleUpdate);
    this.registerDomEvent(document, "keyup", scheduleUpdate);
    this.registerDomEvent(window, "focus", scheduleUpdate);
    this.registerDomEvent(document.body, "mouseenter", scheduleUpdate);
    this.registerDomEvent(document, "visibilitychange", () => {
      if (!document.hidden) scheduleUpdate();
    });
    this.registerInterval(
      window.setInterval(() => {
        if (document.hasFocus()) {
          scheduleUpdate();
        }
      }, 2e3)
    );
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        scheduleUpdate();
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
    console.log("Descargando Obsitracer plugin...");
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
          this.extractIABlocks(file, content);
        }
      } catch (e) {
      }
    }
    this.pendingChanges.set(file.path, { op, path: file.path, excerpt });
    this.scheduleCrudUpdate();
  }
  extractIABlocks(file, content) {
    const lines = content.split("\n");
    const regex = /\/ia\(['"]([^'"]+)['"]\)/;
    let hasMatch = false;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(regex);
      if (m && m.length > 1) {
        this.pendingIABlocks.push({ file: file.path, line: i + 1, prompt: m[1] });
        hasMatch = true;
      }
    }
    if (hasMatch) {
      this.app.vault.process(file, (data) => {
        const dataLines = data.split("\n");
        for (let i = 0; i < dataLines.length; i++) {
          if (regex.test(dataLines[i])) {
            dataLines[i] = dataLines[i].replace(regex, "").trim();
          }
        }
        return dataLines.join("\n");
      }).catch((e) => console.error(e));
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
      const label = `\u{1F4CD} ${this.vaultName}/${this.activeFocus.file}`;
      try {
        (0, import_child_process.exec)(`tmux set -gq @obsitracer "${label}" && tmux refresh-client -S`, { timeout: 200 }, () => {
        });
      } catch (_) {
      }
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
  registerVaultToList() {
    try {
      const baseDir = path.join(os.homedir(), ".config", "obsitracer");
      const listPath = path.join(baseDir, "vaults.json");
      const vaultPath = this.app.vault.adapter.basePath || "";
      let list = [];
      if (fs.existsSync(listPath)) {
        try {
          list = JSON.parse(fs.readFileSync(listPath, "utf8"));
        } catch (e) {
        }
      }
      list = list.filter((v) => fs.existsSync(v.path));
      const indexByPath = list.findIndex((v) => v.path === vaultPath);
      const indexByName = list.findIndex((v) => v.name === this.vaultName);
      let changed = false;
      if (indexByPath !== -1) {
        if (list[indexByPath].name !== this.vaultName) {
          list[indexByPath].name = this.vaultName;
          changed = true;
        }
      } else if (indexByName !== -1) {
        if (list[indexByName].path !== vaultPath) {
          list[indexByName].path = vaultPath;
          changed = true;
        }
      } else {
        list.push({ name: this.vaultName, path: vaultPath });
        changed = true;
      }
      fs.mkdirSync(baseDir, { recursive: true });
      fs.writeFileSync(listPath, JSON.stringify(list, null, 2), "utf8");
    } catch (e) {
      console.error("Error registrando vault en la lista global:", e);
    }
  }
};
