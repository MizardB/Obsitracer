import { Plugin, Editor, MarkdownView, TFile, TAbstractFile } from 'obsidian';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export default class MemoriaTracker extends Plugin {
	private focusDebounceTimer: NodeJS.Timeout | null = null;
	private crudDebounceTimer: NodeJS.Timeout | null = null;
	private focusPath: string;
	private crudMailboxPath: string;
	private vaultName: string;
	private pendingChanges: Map<string, any> = new Map();
	private pendingIABlocks: any[] = [];
	private activeFocus: any = null;

	async onload() {
		console.log('Cargando Memoria Tracker plugin (Multi-Vault)...');
		
		this.vaultName = this.app.vault.getName();
		const baseDir = path.join(os.homedir(), '.config', 'obsidian-copilot');
		this.focusPath = path.join(baseDir, 'active_focus.json');
		this.crudMailboxPath = path.join(baseDir, 'vaults', `${this.vaultName}.json`);

		// Cursor tracking
		const updateCursor = () => {
			const activeFile = this.app.workspace.getActiveFile();

			if (activeFile) {
				let line = 1;
				let ch = 0;

				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (view && view.file && view.file.path === activeFile.path && view.editor) {
					const pos = view.editor.getCursor();
					line = pos.line + 1;
					ch = pos.ch;
				}

				this.activeFocus = { file: activeFile.path, line, ch };
			}

			// Always flush vault identity, even without an active file
			this.scheduleFocusUpdate();
		};

		const scheduleUpdate = () => {
			setTimeout(updateCursor, 100);
		};

		this.registerDomEvent(document, 'mousedown', scheduleUpdate);
		this.registerDomEvent(document, 'keyup', scheduleUpdate);
		this.registerDomEvent(window, 'focus', scheduleUpdate);
		this.registerDomEvent(document.body, 'mouseenter', scheduleUpdate);

		// Fallback: visibilitychange is more reliable on some Linux WMs
		this.registerDomEvent(document, 'visibilitychange', () => {
			if (!document.hidden) scheduleUpdate();
		});

		// Paracaídas de emergencia (Polling): 
		// Para usuarios de Tiling WMs (i3, bspwm) o Alt+Tab donde el ratón no entra a la ventana
		// ni se disparan clicks, validamos cada 2s si la ventana realmente tiene el foco del OS.
		this.registerInterval(
			window.setInterval(() => {
				if (document.hasFocus()) {
					scheduleUpdate();
				}
			}, 2000)
		);

		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				scheduleUpdate();
			})
		);

		this.registerEvent(
			this.app.workspace.on('editor-change', (editor: Editor, view: MarkdownView) => {
				if (view && view.file) {
					const pos = editor.getCursor();
					this.activeFocus = { file: view.file.path, line: pos.line + 1, ch: pos.ch };
					this.scheduleFocusUpdate();
				}
			})
		);
		this.registerEvent(
			this.app.workspace.on('file-open', (file: TFile | null) => {
				if (file) {
					const view = this.app.workspace.getActiveViewOfType(MarkdownView);
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

		// CRUD tracking
		this.registerEvent(this.app.vault.on('create', (file: TAbstractFile) => this.handleCrud('created', file)));
		this.registerEvent(this.app.vault.on('modify', (file: TAbstractFile) => this.handleCrud('modified', file)));
		this.registerEvent(this.app.vault.on('delete', (file: TAbstractFile) => this.handleCrud('deleted', file)));
		this.registerEvent(this.app.vault.on('rename', (file: TAbstractFile, oldPath: string) => {
			this.pendingChanges.set(oldPath, { op: 'deleted', path: oldPath });
			this.handleCrud('created', file);
			if (this.activeFocus && this.activeFocus.file === oldPath) {
				this.activeFocus.file = file.path;
				this.scheduleFocusUpdate();
			}
		}));
	}

	onunload() {
		console.log('Descargando Memoria Tracker plugin...');
		if (this.focusDebounceTimer) clearTimeout(this.focusDebounceTimer);
		if (this.crudDebounceTimer) clearTimeout(this.crudDebounceTimer);
	}

	private async handleCrud(op: string, abstractFile: TAbstractFile) {
		if (this.shouldIgnore(abstractFile.path)) return;
		if (!(abstractFile instanceof TFile)) return;

		const file = abstractFile as TFile;
		let excerpt = '';

		if (op === 'created' || op === 'modified') {
			try {
				const content = await this.app.vault.cachedRead(file);
				excerpt = content.length > 300 ? content.substring(0, 300) + '...' : content;
				
				if (op === 'modified') {
					this.extractIABlocks(file, content);
				}
			} catch(e) {}
		}

		this.pendingChanges.set(file.path, { op, path: file.path, excerpt });
		this.scheduleCrudUpdate();
	}

	private extractIABlocks(file: TFile, content: string) {
		const lines = content.split('\n');
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
				const dataLines = data.split('\n');
				for (let i = 0; i < dataLines.length; i++) {
					if (regex.test(dataLines[i])) {
						dataLines[i] = dataLines[i].replace(regex, '').trim();
					}
				}
				return dataLines.join('\n');
			}).catch(e => console.error(e));
		}
	}

	private shouldIgnore(filePath: string): boolean {
		const parts = filePath.split('/');
		if (parts.includes('.obsidian') || parts.includes('.git') || parts.includes('.trash')) return true;
		const base = path.basename(filePath);
		if (base.startsWith('.') || base.endsWith('~') || base.endsWith('.tmp')) return true;
		if (!base.endsWith('.md')) return true;
		return false;
	}

	private scheduleFocusUpdate() {
		if (this.focusDebounceTimer) clearTimeout(this.focusDebounceTimer);
		this.focusDebounceTimer = setTimeout(() => this.flushFocus(), 100);
	}

	private scheduleCrudUpdate() {
		if (this.crudDebounceTimer) clearTimeout(this.crudDebounceTimer);
		this.crudDebounceTimer = setTimeout(() => this.flushCrud(), 500);
	}

	private flushFocus() {
		try {
			if (!this.activeFocus) return;
			
			const payload = {
				ts: new Date().toISOString(),
				vault: this.vaultName,
				vaultPath: (this.app.vault.adapter as any).basePath || '',
				focus: this.activeFocus
			};
			
			fs.mkdirSync(path.dirname(this.focusPath), { recursive: true });
			fs.writeFileSync(this.focusPath, JSON.stringify(payload, null, 2), 'utf8');
		} catch (e) {
			console.error('Error actualizando focus:', e);
		}
	}

	private flushCrud() {
		try {
			let data = { ts: new Date().toISOString(), vault: '', changes: [] as any[], ia_blocks: [] as any[] };
			
			if (fs.existsSync(this.crudMailboxPath)) {
				try {
					data = JSON.parse(fs.readFileSync(this.crudMailboxPath, 'utf8'));
				} catch (e) {}
			}

			// Merge changes
			const mergedChanges = [...(data.changes || [])];
			for (const change of this.pendingChanges.values()) {
				mergedChanges.push(change);
			}
			
			// Merge blocks
			const mergedBlocks = [...(data.ia_blocks || []), ...this.pendingIABlocks];

			const payload = {
				ts: new Date().toISOString(),
				vault: (this.app.vault.adapter as any).basePath || '',
				changes: mergedChanges,
				ia_blocks: mergedBlocks
			};

			fs.mkdirSync(path.dirname(this.crudMailboxPath), { recursive: true });
			fs.writeFileSync(this.crudMailboxPath, JSON.stringify(payload, null, 2), 'utf8');

			// Clear pending
			this.pendingChanges.clear();
			this.pendingIABlocks = [];
		} catch (err) {
			console.error('Error escribiendo al buzón CRUD:', err);
		}
	}
}
