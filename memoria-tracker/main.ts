import { Plugin, Editor, MarkdownView, TFile, TAbstractFile } from 'obsidian';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export default class MemoriaTracker extends Plugin {
	private debounceTimer: NodeJS.Timeout | null = null;
	private vaultDiffPath: string;
	private pendingChanges: Map<string, any> = new Map();
	private pendingIABlocks: any[] = [];
	private activeFocus: any = null;

	async onload() {
		console.log('Cargando Memoria Tracker plugin (CRUD + Cursor)...');
		
		const home = os.homedir();
		this.vaultDiffPath = path.join(home, '.config', 'academico-it', 'vault_diff.json');

		// Cursor tracking
		this.registerEvent(
			this.app.workspace.on('editor-change', (editor: Editor, view: MarkdownView) => {
				if (view && view.file) {
					const pos = editor.getCursor();
					this.activeFocus = { file: view.file.path, line: pos.line + 1, ch: pos.ch };
					this.scheduleUpdate();
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
					this.scheduleUpdate();
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
		}));
	}

	onunload() {
		console.log('Descargando Memoria Tracker plugin...');
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
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
					this.extractIABlocks(file.path, content);
				}
			} catch(e) {}
		}

		this.pendingChanges.set(file.path, { op, path: file.path, excerpt });
		this.scheduleUpdate();
	}

	private extractIABlocks(filePath: string, content: string) {
		const lines = content.split('\n');
		const regex = /\/ia\(['"]([^'"]+)['"]\)/;
		for (let i = 0; i < lines.length; i++) {
			const m = lines[i].match(regex);
			if (m && m.length > 1) {
				this.pendingIABlocks.push({ file: filePath, line: i + 1, prompt: m[1] });
			}
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

	private scheduleUpdate() {
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		this.debounceTimer = setTimeout(() => this.flushToMailbox(), 500);
	}

	private flushToMailbox() {
		try {
			let data = { ts: new Date().toISOString(), vault: '', changes: [] as any[], ia_blocks: [] as any[], activeFocus: null as any };
			
			if (fs.existsSync(this.vaultDiffPath)) {
				try {
					data = JSON.parse(fs.readFileSync(this.vaultDiffPath, 'utf8'));
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
				ia_blocks: mergedBlocks,
				activeFocus: this.activeFocus || data.activeFocus
			};

			fs.mkdirSync(path.dirname(this.vaultDiffPath), { recursive: true });
			fs.writeFileSync(this.vaultDiffPath, JSON.stringify(payload, null, 2), 'utf8');

			// Clear pending
			this.pendingChanges.clear();
			this.pendingIABlocks = [];
		} catch (err) {
			console.error('Error escribiendo al buzón:', err);
		}
	}
}
