#!/usr/bin/env python3
"""
🧠 Obsitracer — Floating Popup Kitten for Kitty
Lanza el selector de Vault como una ventana flotante nativa centrada (os-window),
garantizando cero mutaciones de layout en los splits y cero parpadeo en AGY.
"""
import subprocess
from kittens.tui.handler import result_handler
from kitty.boss import Boss


def main(args: list[str]) -> str:
	pass


@result_handler(no_ui=True)
def handle_result(
	args: list[str], answer: str, target_window_id: int, boss: Boss
) -> None:
	active_tab = boss.active_tab
	tab_id = str(active_tab.id) if active_tab else ""
	win_ids = []
	if active_tab:
		try:
			win_ids = [str(w.id) for w in active_tab]
		except Exception:
			pass
	if not win_ids and target_window_id:
		win_ids = [str(target_window_id)]

	cmd = [
		"kitty",
		"--class=obsitracer-popup",
		"--title=🧠 Obsitracer — Sintonizar Vault",
		"-o",
		"initial_window_width=82c",
		"-o",
		"initial_window_height=18c",
		"-o",
		"remember_window_size=no",
		"-o",
		"confirm_os_window_close=0",
		"-o",
		"hide_window_decorations=yes",
		"obsitracer",
		"select",
	]
	if tab_id:
		cmd.extend(["--tab", tab_id])
	if win_ids:
		cmd.extend(["--windows", ",".join(win_ids)])
	if target_window_id:
		cmd.extend(["--pane", str(target_window_id)])

	subprocess.Popen(cmd)
