#!/usr/bin/env python3
"""
🧠 Obsitracer — Kitty Tab Bar Status Widget
Renderiza la barra de pestañas estándar con Powerline y añade el badge de foco
contextual de Obsitracer en el extremo derecho de la barra.
"""
import json
import os
from kitty.tab_bar import (
	DrawData,
	ExtraData,
	Screen,
	TabBarData,
	as_rgb,
	draw_tab_with_powerline,
)

COLOR_PURPLE = as_rgb(0xBB9AF7)
COLOR_DARK = as_rgb(0x16161E)


_active_tab_id: int | None = None


def _get_obsitracer_info(tab_id: int | None) -> tuple[str, str]:
	if not tab_id:
		return ("", "")
	try:
		home = os.path.expanduser("~")
		targets_dir = os.path.join(home, ".config", "obsitracer", "targets")
		tab_target_file = os.path.join(targets_dir, f"kitty-tab-{tab_id}")
		# Solo renderizar si la pestaña activa tiene target sintonizado explícitamente
		if not os.path.exists(tab_target_file):
			return ("", "")

		with open(tab_target_file, "r") as f:
			target = f.read().strip()
		if not target:
			return ("", "")

		focus_file = os.path.join(
			home, ".config", "obsitracer", "vaults", target, "focus.json"
		)
		if os.path.exists(focus_file):
			with open(focus_file, "r") as f:
				data = json.load(f)
				note = data.get("focus", {}).get("file", "")
				if note:
					base = os.path.basename(note)
					return (target, base)
		return (target, "")
	except Exception:
		return ("", "")


def _draw_right_status(draw_data: DrawData, screen: Screen, tab_id: int | None) -> None:
	target, note = _get_obsitracer_info(tab_id)
	if not target:
		return

	# Icono Nerd Font de ojo visor (󰈈) con espacio de respiro
	icon = "󰈈"
	if note:
		body = f" {icon}  {target} ╱ {note} "
	else:
		body = f" {icon}  {target} "

	from kitty.tab_bar import wcswidth
	body_len = wcswidth(body)
	# 1 celda para el slant de entrada () + el cuerpo que llega al borde derecho
	total_len = 1 + body_len

	# Solo dibujar si hay suficiente espacio libre hacia la derecha
	if screen.cursor.x >= screen.columns - total_len - 2:
		return

	orig_fg = screen.cursor.fg
	orig_bg = screen.cursor.bg

	default_bg = as_rgb(int(draw_data.default_bg))
	# Color sólido idéntico a las tabs activas (Tokyo Night Purple #bb9af7 para Obsidian)
	tab_bg = COLOR_PURPLE
	tab_fg = COLOR_DARK

	# Posicionar al inicio del tab derecho
	screen.cursor.x = screen.columns - total_len

	# 1. Separador slanted inicial (entra al tab con la misma inclinación )
	screen.cursor.fg = default_bg
	screen.cursor.bg = tab_bg
	screen.cursor.bold = False
	screen.draw("")

	# 2. Cuerpo del tab (fondo sólido completo hasta el borde derecho de la pantalla)
	screen.cursor.bg = tab_bg
	screen.cursor.fg = tab_fg
	screen.cursor.bold = True
	screen.draw(body)

	# Restaurar atributos visuales
	screen.cursor.bold = False
	screen.cursor.fg = orig_fg
	screen.cursor.bg = orig_bg


def draw_tab(
	draw_data: DrawData,
	screen: Screen,
	tab: TabBarData,
	before: int,
	max_tab_length: int,
	index: int,
	is_last: bool,
	extra_data: ExtraData,
) -> int:
	global _active_tab_id
	if tab.is_active:
		_active_tab_id = tab.tab_id

	end = draw_tab_with_powerline(
		draw_data, screen, tab, before, max_tab_length, index, is_last, extra_data
	)
	if is_last and not extra_data.for_layout:
		_draw_right_status(draw_data, screen, _active_tab_id)
	return end
