import type { AmmoType, LootItemDefinition } from '../../loot/ILootSystem';
import type { HudActionSlotId } from '../../input/ControlSettings';
import type { EmoteIconKind } from '../../emotes/EmoteCatalog';

function svgWrap(viewBox: string, body: string, className = 'w-full h-full'): string {
  return `<svg viewBox="${viewBox}" class="${className}" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
}

export function getWeaponSvg(weaponId: string | null | undefined, accentHex = '#f8fafc'): string {
  switch (weaponId) {
    case 'ump':
      return svgWrap(
        '0 0 64 32',
        `<path d="M8 12h29l3 2h9v3h-9l-3 2H26l-1 6h-5l1-6h-6l-2 5H8v-5l-4 1v-6l4-2Z" fill="${accentHex}" fill-opacity="0.92" stroke="#0f172a" stroke-width="1.3" stroke-linejoin="round"/>
         <rect x="27" y="19" width="4.5" height="9" rx="1" transform="rotate(6 27 19)" fill="#94a3b8" stroke="#0f172a" stroke-width="1.1"/>
         <rect x="18" y="9.5" width="12" height="2" rx="0.8" fill="#38bdf8"/>
         <path d="M49 14.5h7v2h-7z" fill="#cbd5e1"/>`,
      );
    case 'mp5':
      return svgWrap(
        '0 0 64 32',
        `<path d="M7 13h30l3 1.5h11v3H40l-2 1.5H27l-2 6h-4.5l1.5-6H15l-2 4.5H8.5l1.5-5H5v-4l2-1.5Z" fill="${accentHex}" fill-opacity="0.92" stroke="#0f172a" stroke-width="1.3" stroke-linejoin="round"/>
         <path d="M29 19c.2 3.8 1.5 7 3.6 9.5l3.8-1.3c-1.7-2.2-2.6-4.8-2.8-8.2H29Z" fill="#cbd5e1" stroke="#0f172a" stroke-width="1.1"/>
         <circle cx="48" cy="12" r="2.1" stroke="#22c55e" stroke-width="1.5"/>
         <rect x="51" y="14.5" width="6" height="2.4" rx="0.8" fill="#94a3b8"/>`,
      );
    case 'mp40':
      return svgWrap(
        '0 0 64 32',
        `<path d="M12 13h33v3.2H32l-1.5 2H17l-2.5 5H10l1.8-5.5L5 21v-3l7-5Z" fill="${accentHex}" fill-opacity="0.92" stroke="#0f172a" stroke-width="1.3" stroke-linejoin="round"/>
         <rect x="33" y="16" width="3.8" height="12.5" rx="0.8" fill="#94a3b8" stroke="#0f172a" stroke-width="1.1"/>
         <rect x="45" y="13.8" width="13" height="2" rx="0.7" fill="#cbd5e1"/>
         <path d="M14 18.5 7 24.5" stroke="#64748b" stroke-width="2" stroke-linecap="round"/>`,
      );
    case 'scar':
      return svgWrap(
        '0 0 64 32',
        `<path d="M4 13.5 14 12h25l2 2h11v2.6H41l-2 2H26l-1.8 6H19.5l1.5-6H13l-1.5 4.2H4v-9.3Z" fill="${accentHex}" fill-opacity="0.94" stroke="#0f172a" stroke-width="1.3" stroke-linejoin="round"/>
         <path d="M29 18.5h4.8l1.2 9.2h-4.6L29 18.5Z" fill="#f59e0b" stroke="#0f172a" stroke-width="1.1"/>
         <rect x="19" y="9.2" width="15" height="2.3" rx="0.8" fill="#38bdf8"/>
         <rect x="52" y="14.1" width="8" height="2.3" rx="0.6" fill="#cbd5e1"/>`,
      );
    case 'ak24':
      return svgWrap(
        '0 0 64 32',
        `<path d="M4 15.5 15 12.5h23l3 1.8h12v2.4H41l-2 2H25l-2 5.8h-4.5l1.5-5.8H13l-9 4.5v-7.7Z" fill="${accentHex}" fill-opacity="0.94" stroke="#0f172a" stroke-width="1.3" stroke-linejoin="round"/>
         <path d="M29.5 18.5c1 4.2 3.2 7.5 6.4 9.8l3.5-2c-2.6-2-4.2-4.6-5-7.8h-4.9Z" fill="#ef4444" stroke="#0f172a" stroke-width="1.1"/>
         <path d="M38 11.4h11v2H38z" fill="#cbd5e1"/>
         <rect x="53" y="14.5" width="7" height="2" rx="0.6" fill="#94a3b8"/>`,
      );
    case 'parafal':
      return svgWrap(
        '0 0 64 32',
        `<path d="M4 13.5h11l3-1.5h24l2 1.8h13v2.4H44l-2 2H26l-1.8 6h-4.4l1.2-6H13l-2 4.5H4v-9.2Z" fill="${accentHex}" fill-opacity="0.95" stroke="#0f172a" stroke-width="1.3" stroke-linejoin="round"/>
         <rect x="29" y="18.2" width="5.2" height="9" rx="0.9" fill="#eab308" stroke="#0f172a" stroke-width="1.1"/>
         <rect x="20" y="9" width="17" height="2.4" rx="0.9" fill="#f8fafc"/>
         <rect x="57" y="14" width="4" height="2.2" fill="#cbd5e1"/>`,
      );
    case 'm1887':
      return svgWrap(
        '0 0 64 32',
        `<path d="M5 17.5 15 14h16l3-2h24v2.6H34v2.2h21v2H33l-2.5 2H22c0 3.2-2.2 5.4-5.2 5.4-2.1 0-3.8-1-4.8-2.6l-7 2v-8.1Z" fill="${accentHex}" fill-opacity="0.94" stroke="#0f172a" stroke-width="1.3" stroke-linejoin="round"/>
         <ellipse cx="17" cy="22.8" rx="3.2" ry="2.2" stroke="#f97316" stroke-width="2" fill="none"/>
         <rect x="35" y="11.6" width="23" height="2" rx="0.7" fill="#cbd5e1"/>`,
      );
    case 'awm':
      return svgWrap(
        '0 0 64 32',
        `<path d="M3 15.5 14 13h22l2 1.8h20v2.2H38l-2 2.2H24l-2 5.5h-4.2l1.2-5.5h-5l-2 4H3v-7.7Z" fill="${accentHex}" fill-opacity="0.95" stroke="#0f172a" stroke-width="1.2" stroke-linejoin="round"/>
         <path d="M22 8.2h16v3.2H22z" fill="#84cc16" stroke="#0f172a" stroke-width="1"/>
         <circle cx="20.5" cy="9.8" r="2.2" fill="#38bdf8" stroke="#0f172a" stroke-width="1"/>
         <circle cx="39.5" cy="9.8" r="2.4" fill="#38bdf8" stroke="#0f172a" stroke-width="1"/>
         <rect x="58" y="14.1" width="4" height="3.6" rx="0.6" fill="#e2e8f0"/>
         <path d="M43 19.2 46 25m-6-5.8-2 5.8" stroke="#94a3b8" stroke-width="1.6" stroke-linecap="round"/>`,
      );
    case 'm4a1':
      return svgWrap(
        '0 0 64 32',
        `<path d="M4 13h10l2-1.5h23l2 2h12v2.4H41l-2 2H26l-1.8 6H19.6l1.4-6H13l-1.6 4.4H4V13Z" fill="${accentHex}" fill-opacity="0.94" stroke="#0f172a" stroke-width="1.3" stroke-linejoin="round"/>
         <path d="M29 18.2h4.6l1.4 9h-4.5L29 18.2Z" fill="#38bdf8" stroke="#0f172a" stroke-width="1.1"/>
         <path d="M21 10.2h12l1 1.4H20z" fill="#e2e8f0" stroke="#0f172a" stroke-width="0.9"/>
         <rect x="53" y="14" width="7" height="2" rx="0.6" fill="#cbd5e1"/>`,
      );
    case 'm1014':
      return svgWrap(
        '0 0 64 32',
        `<path d="M4 15.5 15 13h22l2-1h20v2.4H39v2h17v1.8H37l-3 1.8H24l-2 5.4h-4.4l1.4-5.4h-5.5L4 23v-7.5Z" fill="${accentHex}" fill-opacity="0.94" stroke="#0f172a" stroke-width="1.3" stroke-linejoin="round"/>
         <rect x="38" y="16.3" width="14" height="2.4" rx="0.8" fill="#ef4444" stroke="#0f172a" stroke-width="0.9"/>
         <rect x="20" y="10.2" width="12" height="1.8" rx="0.7" fill="#cbd5e1"/>`,
      );
    case 'kar98k':
      return svgWrap(
        '0 0 64 32',
        `<path d="M4 17.5 16 14h21l2 1.2h21v2H39l-2 2.2H22l-3.5 3.6H12l-8 1.8v-7.3Z" fill="#b45309" fill-opacity="0.95" stroke="#0f172a" stroke-width="1.3" stroke-linejoin="round"/>
         <rect x="37" y="13.5" width="24" height="2.1" rx="0.7" fill="#cbd5e1" stroke="#0f172a" stroke-width="0.9"/>
         <path d="M28 14.5v-2.4l3 1.2" stroke="#e2e8f0" stroke-width="1.6" stroke-linecap="round"/>`,
      );
    case 'desert_eagle':
      return svgWrap(
        '0 0 64 32',
        `<path d="M16 11h31l3 2.5v3.2H32l-3.5 10.5H20l3.2-10.5H16V11Z" fill="${accentHex}" fill-opacity="0.96" stroke="#0f172a" stroke-width="1.4" stroke-linejoin="round"/>
         <path d="M16 11h30l2.5 2.2H16V11Z" fill="#e2e8f0"/>
         <path d="M28 16.8h6l-1.5 3.8h-4.5" stroke="#0f172a" stroke-width="1.3" fill="none"/>`,
      );
    case 'glock':
      return svgWrap(
        '0 0 64 32',
        `<path d="M18 11.5h28v4.5H32l-3 10.5h-7.2l2.8-10.5H18v-4.5Z" fill="${accentHex}" fill-opacity="0.95" stroke="#0f172a" stroke-width="1.4" stroke-linejoin="round"/>
         <rect x="18" y="11.5" width="28" height="2.6" fill="#38bdf8" fill-opacity="0.85"/>
         <path d="M28 16h5.5l-1 3.6h-4.5" stroke="#0f172a" stroke-width="1.3" fill="none"/>`,
      );
    case 'combat_knife':
      return svgWrap(
        '0 0 64 32',
        `<path d="M10 18.5h15l2 3.5h-3v-2H10v-1.5Z" fill="#334155" stroke="#0f172a" stroke-width="1.3"/>
         <rect x="9" y="14.5" width="16" height="4.4" rx="1.2" fill="#475569" stroke="#0f172a" stroke-width="1.3"/>
         <rect x="24" y="12.2" width="2.8" height="9.4" rx="0.9" fill="#f59e0b" stroke="#0f172a" stroke-width="1.1"/>
         <path d="M26.8 14h24.5l4.7 2.4-7.5 3H26.8V14Z" fill="#e2e8f0" stroke="#0f172a" stroke-width="1.3" stroke-linejoin="round"/>`,
      );
    case 'baseball_bat':
      return svgWrap(
        '0 0 64 32',
        `<path d="M7 15.2h12l34-3.8c3 0 4.5 1.8 4.5 4.6s-1.5 4.6-4.5 4.6l-34-3.8H7v-1.6Z" fill="${accentHex}" fill-opacity="0.95" stroke="#0f172a" stroke-width="1.4" stroke-linejoin="round"/>
         <rect x="7" y="14.2" width="11" height="3.6" rx="1" fill="#1e293b"/>
         <circle cx="6.5" cy="16" r="2.1" fill="#94a3b8" stroke="#0f172a" stroke-width="1.1"/>`,
      );
    case 'famas':
      return svgWrap(
        '0 0 64 32',
        `<path d="M5 14.5h33l3 1.5h11v2.2H41l-2 2H26l-2 4.5h-4l1-4.5H13l-1 6.5H7.5L8 20H5v-5.5Z" fill="${accentHex}" fill-opacity="0.94" stroke="#0f172a" stroke-width="1.3" stroke-linejoin="round"/>
         <path d="M12 14.5V10h21v4.5" stroke="#cbd5e1" stroke-width="2" stroke-linejoin="round"/>
         <rect x="11" y="20" width="4.5" height="8" rx="0.8" fill="#38bdf8" stroke="#0f172a" stroke-width="1"/>
         <rect x="52" y="16.2" width="6" height="1.8" rx="0.5" fill="#cbd5e1"/>`,
      );
    case 'aug':
      return svgWrap(
        '0 0 64 32',
        `<path d="M5 15h34l2 1.2h12v2H41l-3 2H24l-2.5 5H17l1.5-5H12l-1.5 6.5H6L7 20H5v-5Z" fill="${accentHex}" fill-opacity="0.95" stroke="#0f172a" stroke-width="1.3" stroke-linejoin="round"/>
         <rect x="21" y="9.8" width="13" height="3" rx="1" fill="#84cc16" stroke="#0f172a" stroke-width="1"/>
         <rect x="9.5" y="20" width="4.4" height="8.5" rx="0.8" fill="#a3e635" stroke="#0f172a" stroke-width="1"/>
         <path d="M35 20l-2 4.8" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round"/>`,
      );
    case 'groza':
      return svgWrap(
        '0 0 64 32',
        `<path d="M6 14h33l4 1.6h8v2.6h-9l-2 2H24l-2 5h-4.5l1.5-5H12l-1 6.8H6.5L7.5 20H6v-6Z" fill="${accentHex}" fill-opacity="0.95" stroke="#0f172a" stroke-width="1.3" stroke-linejoin="round"/>
         <path d="M18 11.2h15v2.8H18z" fill="#f97316" stroke="#0f172a" stroke-width="1"/>
         <path d="M9.5 20c.8 3.6 2 6.2 4 8.2l3.4-1.5c-1.5-1.8-2.4-3.8-3-6.7H9.5Z" fill="#f59e0b" stroke="#0f172a" stroke-width="1"/>
         <rect x="51" y="15.2" width="7" height="3" rx="0.8" fill="#64748b"/>`,
      );
    case 'an94':
      return svgWrap(
        '0 0 64 32',
        `<path d="M4 15.2 15 12.5h24l3 1.8h12v2.2H42l-2 2H26l-2 5.6h-4.5l1.5-5.6H13l-9 4.2v-7.5Z" fill="${accentHex}" fill-opacity="0.94" stroke="#0f172a" stroke-width="1.3" stroke-linejoin="round"/>
         <path d="M30 18.5c1.5 4 4 7 7.2 9l3.2-2.2c-2.6-1.8-4.4-4-5.4-6.8H30Z" fill="#06b6d4" stroke="#0f172a" stroke-width="1.1"/>
         <rect x="22" y="9.5" width="12" height="2.2" rx="0.7" fill="#cbd5e1"/>
         <rect x="54" y="14.1" width="6" height="2.6" rx="0.6" fill="#94a3b8"/>`,
      );
    case 'vector':
      return svgWrap(
        '0 0 64 32',
        `<path d="M8 13h34v4.5h9v2.2h-9l-3 5.5H27l-2.2 4.8h-4.5l1.8-4.8H16l-2 4.5H9.5l1.5-5H8V13Z" fill="${accentHex}" fill-opacity="0.95" stroke="#0f172a" stroke-width="1.3" stroke-linejoin="round"/>
         <rect x="28" y="19.5" width="4.4" height="10" rx="0.9" transform="rotate(-8 28 19.5)" fill="#38bdf8" stroke="#0f172a" stroke-width="1"/>
         <rect x="21" y="10" width="11" height="2.2" rx="0.7" fill="#e2e8f0"/>`,
      );
    case 'p90':
      return svgWrap(
        '0 0 64 32',
        `<path d="M7 14.5h38l4 1.8h6v2.2h-7l-4 2.5H26l-3 5.5H12l2-5.5H7v-6.5Z" fill="${accentHex}" fill-opacity="0.95" stroke="#0f172a" stroke-width="1.3" stroke-linejoin="round"/>
         <rect x="15" y="10.8" width="23" height="2.8" rx="1" fill="#38bdf8" stroke="#0f172a" stroke-width="1"/>
         <ellipse cx="16.5" cy="18.2" rx="3.2" ry="1.8" fill="#0f172a"/>
         <ellipse cx="32.5" cy="18.2" rx="3.5" ry="1.8" fill="#0f172a"/>`,
      );
    case 'thompson':
      return svgWrap(
        '0 0 64 32',
        `<path d="M4 17.5 16 14h26v2.8h14v2.2H42l-2 2H22l-2 5.5h-4.5l1.5-5.5H11l-7 3.2v-6.7Z" fill="#b45309" fill-opacity="0.95" stroke="#0f172a" stroke-width="1.3" stroke-linejoin="round"/>
         <circle cx="31" cy="23.2" r="5.5" fill="#475569" stroke="#0f172a" stroke-width="1.3"/>
         <circle cx="31" cy="23.2" r="2.2" fill="#f59e0b"/>
         <rect x="39" y="19" width="3.5" height="5.5" rx="0.8" fill="#92400e" stroke="#0f172a" stroke-width="1"/>`,
      );
    case 'spas12':
      return svgWrap(
        '0 0 64 32',
        `<path d="M5 14.5h12l3-1.8h37v2.4H39v2.2h15v2H37l-2.5 2H22l-2 5.2h-4.5l1.5-5.2h-6L5 22v-7.5Z" fill="${accentHex}" fill-opacity="0.94" stroke="#0f172a" stroke-width="1.3" stroke-linejoin="round"/>
         <path d="M6 12.2h13v2.3H6z" fill="#94a3b8" stroke="#0f172a" stroke-width="1"/>
         <rect x="38" y="16.4" width="13" height="2.4" rx="0.7" fill="#334155" stroke="#0f172a" stroke-width="0.9"/>`,
      );
    case 'double_barrel':
      return svgWrap(
        '0 0 64 32',
        `<path d="M5 18.5 16 14.5h13l3-1.8h27v2H32v1.6h27v1.8H31l-2.5 2H21l-12 4.5-4-6.1Z" fill="#92400e" fill-opacity="0.95" stroke="#0f172a" stroke-width="1.3" stroke-linejoin="round"/>
         <rect x="32" y="12.7" width="27" height="2" rx="0.5" fill="#cbd5e1" stroke="#0f172a" stroke-width="0.8"/>
         <rect x="32" y="15.1" width="27" height="2" rx="0.5" fill="#94a3b8" stroke="#0f172a" stroke-width="0.8"/>`,
      );
    case 'm24':
      return svgWrap(
        '0 0 64 32',
        `<path d="M3 16 14 13.5h22l2 1.6h21v2H38l-2 2.2H22l-3.5 3.8H11l-8 1.5V16Z" fill="${accentHex}" fill-opacity="0.95" stroke="#0f172a" stroke-width="1.2" stroke-linejoin="round"/>
         <rect x="21" y="8.5" width="15" height="3" rx="0.9" fill="#38bdf8" stroke="#0f172a" stroke-width="1"/>
         <rect x="57" y="14.5" width="4" height="2.8" rx="0.5" fill="#cbd5e1"/>
         <path d="M43 18.5l2.5 5.5m-5-5.5-2 5.5" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/>`,
      );
    case 'svd':
      return svgWrap(
        '0 0 64 32',
        `<path d="M4 16 15 13h22l3 1.6h20v2H40l-2 2H24l-2 4.8h-4l1-4.8h-6L4 21.8V16Z" fill="#b45309" fill-opacity="0.95" stroke="#0f172a" stroke-width="1.2" stroke-linejoin="round"/>
         <path d="M26 18.5h4.2l1.8 6.5h-4.2L26 18.5Z" fill="#475569" stroke="#0f172a" stroke-width="1"/>
         <rect x="21" y="9" width="13" height="2.8" rx="0.9" fill="#eab308" stroke="#0f172a" stroke-width="0.9"/>
         <ellipse cx="10.5" cy="17.5" rx="3" ry="1.5" fill="#0f172a"/>`,
      );
    case 'vss':
      return svgWrap(
        '0 0 64 32',
        `<path d="M5 16.2 15 13.5h21l2 1.2h20v3.8H38l-2 1.6H23l-2 5.2h-4l1-5.2h-5L5 22v-5.8Z" fill="${accentHex}" fill-opacity="0.95" stroke="#0f172a" stroke-width="1.2" stroke-linejoin="round"/>
         <rect x="37" y="13.5" width="21" height="4.4" rx="1.4" fill="#334155" stroke="#0f172a" stroke-width="1.1"/>
         <rect x="20" y="9.2" width="12" height="2.8" rx="0.9" fill="#a855f7" stroke="#0f172a" stroke-width="0.9"/>
         <rect x="25" y="19.5" width="4.4" height="7" rx="0.8" fill="#1e293b" stroke="#0f172a" stroke-width="1"/>`,
      );
    case 'dragunov':
      return svgWrap(
        '0 0 64 32',
        `<path d="M3 16 15 13h22l3 1.5h20v2H40l-2 2H24l-2 4.8h-4.2l1.2-4.8h-6L3 21.8V16Z" fill="${accentHex}" fill-opacity="0.95" stroke="#0f172a" stroke-width="1.2" stroke-linejoin="round"/>
         <path d="M26 18.5h4.4l2 6.8h-4.2L26 18.5Z" fill="#f59e0b" stroke="#0f172a" stroke-width="1"/>
         <rect x="21" y="8.4" width="15" height="3" rx="0.9" fill="#38bdf8" stroke="#0f172a" stroke-width="0.9"/>
         <path d="M44 18.2l3 5.8" stroke="#cbd5e1" stroke-width="1.5" stroke-linecap="round"/>`,
      );
    case 'usp':
      return svgWrap(
        '0 0 64 32',
        `<path d="M16 11.5h29v4.2H31l-3 10.5h-7.2l2.8-10.5H16v-4.2Z" fill="${accentHex}" fill-opacity="0.95" stroke="#0f172a" stroke-width="1.4" stroke-linejoin="round"/>
         <rect x="33" y="15.7" width="10" height="2.6" rx="0.6" fill="#475569" stroke="#0f172a" stroke-width="0.9"/>
         <rect x="16" y="11.5" width="29" height="2.4" fill="#cbd5e1"/>`,
      );
    case 'm1917':
      return svgWrap(
        '0 0 64 32',
        `<path d="M22 13h29v2.6H35l-2 2.2H26l-3.5 9.2h-6.2l3.8-8.8c-1.8-.6-2.8-2.2-2.2-4.1L22 13Z" fill="${accentHex}" fill-opacity="0.96" stroke="#0f172a" stroke-width="1.3" stroke-linejoin="round"/>
         <rect x="25" y="12.6" width="8.5" height="5.5" rx="1.4" fill="#94a3b8" stroke="#0f172a" stroke-width="1.2"/>
         <path d="M18.5 19.5c-1.4 3-2 5.4-2.2 7.5h5.8l2.2-6.8-5.8-.7Z" fill="#b45309" stroke="#0f172a" stroke-width="1.1"/>`,
      );
    case 'm249':
      return svgWrap(
        '0 0 64 32',
        `<path d="M4 14.5 14 12.5h26l2 1.6h16v2.4H42l-2 2H24l-2 5.5h-4l1-5.5H12l-1 4.2H4v-8.2Z" fill="${accentHex}" fill-opacity="0.95" stroke="#0f172a" stroke-width="1.3" stroke-linejoin="round"/>
         <rect x="26" y="18.5" width="9" height="8.5" rx="1.2" fill="#22c55e" stroke="#0f172a" stroke-width="1.2"/>
         <path d="M22 10h12v2.4H22z" fill="#cbd5e1"/>
         <path d="M46 18.2l2.8 6.2m-5.2-6.2-2.2 6.2" stroke="#94a3b8" stroke-width="1.6" stroke-linecap="round"/>`,
      );
    case 'm60':
      return svgWrap(
        '0 0 64 32',
        `<path d="M4 15 15 13h25l2 1.5h18v2.4H42l-2 2H24l-2 5.2h-4.2l1.2-5.2H12l-8 3.2V15Z" fill="${accentHex}" fill-opacity="0.95" stroke="#0f172a" stroke-width="1.3" stroke-linejoin="round"/>
         <rect x="26" y="18.2" width="10" height="8.5" rx="1.2" fill="#84cc16" stroke="#0f172a" stroke-width="1.2"/>
         <rect x="38" y="12.5" width="12" height="3.2" rx="0.8" fill="#475569"/>
         <path d="M49 18.5l2.5 5.8m-5-5.8-2 5.8" stroke="#cbd5e1" stroke-width="1.6" stroke-linecap="round"/>`,
      );
    case 'dp28':
      return svgWrap(
        '0 0 64 32',
        `<path d="M4 17.5 16 14h24l2 1.4h18v2H42l-2 2H24l-3 3.6H12l-8 1.8v-7.3Z" fill="#b45309" fill-opacity="0.95" stroke="#0f172a" stroke-width="1.3" stroke-linejoin="round"/>
         <ellipse cx="32" cy="12" rx="9" ry="2.8" fill="#475569" stroke="#0f172a" stroke-width="1.3"/>
         <ellipse cx="32" cy="11.2" rx="4" ry="1.1" fill="#f59e0b"/>
         <path d="M46 17.6l2.8 6.4m-5.2-6.4-2.4 6.4" stroke="#cbd5e1" stroke-width="1.6" stroke-linecap="round"/>`,
      );
    default:
      return getFistsSvg();
  }
}

export function getFistsSvg(): string {
  return getPunchSvg();
}

export function getPunchSvg(): string {
  return svgWrap(
    '0 0 48 48',
    `<path d="M14 19v-5.5a2.8 2.8 0 0 1 5.6 0V18h1v-6a2.8 2.8 0 0 1 5.6 0v6h1v-5.2a2.8 2.8 0 0 1 5.6 0V19h1v-3a2.6 2.6 0 0 1 5.2 0v9.5c0 6.8-4.6 11.8-11.2 11.8H20.8c-4.2 0-7.6-2.6-9.4-6.4l-2.6-5.5a2.8 2.8 0 0 1 5-2.5l.2.4Z" fill="#f8fafc" fill-opacity="0.95" stroke="#0f172a" stroke-width="2" stroke-linejoin="round"/>
     <path d="M14.5 22.5h19" stroke="#f97316" stroke-width="2.6" stroke-linecap="round"/>
     <path d="M8 12l4 2.5M7 17.5h4M10.5 7.5l2.8 3.6" stroke="#fb923c" stroke-width="2.2" stroke-linecap="round"/>`,
  );
}

export function getHolsterSvg(): string {
  return svgWrap(
    '0 0 48 48',
    `<path d="M11 33 29 15l3 1 5-5 3 3-5 5-2 3-18 18-4-2v-5Z" fill="#e2e8f0" fill-opacity="0.92" stroke="#0f172a" stroke-width="1.8" stroke-linejoin="round"/>
     <path d="M22 22l4 8-3 2-3.5-7.5" fill="#94a3b8" stroke="#0f172a" stroke-width="1.4" stroke-linejoin="round"/>
     <path d="M10 11c8 2 18 12 24 25" stroke="#38bdf8" stroke-width="2.4" stroke-dasharray="3 2.5" stroke-linecap="round"/>
     <path d="M35 12v10m-3.5-3.5L35 22l3.5-3.5" stroke="#f97316" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
}

export function getAmmoSvg(ammoType: AmmoType): string {
  if (ammoType === 'SHOTGUN') {
    return svgWrap(
      '0 0 48 48',
      `<g stroke="#0f172a" stroke-width="1.6">
        <rect x="12" y="10" width="9" height="23" rx="1.5" fill="#f97316"/>
        <rect x="12" y="31" width="9" height="7" rx="1" fill="#fbbf24"/>
        <rect x="27" y="10" width="9" height="23" rx="1.5" fill="#f97316"/>
        <rect x="27" y="31" width="9" height="7" rx="1" fill="#fbbf24"/>
      </g>`,
    );
  }
  if (ammoType === 'SNIPER') {
    return svgWrap(
      '0 0 48 48',
      `<g stroke="#0f172a" stroke-width="1.6" stroke-linejoin="round">
        <path d="M13 18 17 7l4 11v20h-8V18Z" fill="#84cc16"/>
        <rect x="13" y="21" width="8" height="17" fill="#eab308"/>
        <path d="M27 18 31 7l4 11v20h-8V18Z" fill="#84cc16"/>
        <rect x="27" y="21" width="8" height="17" fill="#eab308"/>
      </g>`,
    );
  }
  if (ammoType === 'SMG') {
    return svgWrap(
      '0 0 48 48',
      `<g stroke="#0f172a" stroke-width="1.5" stroke-linejoin="round">
        <path d="M9 19a3.5 3.5 0 0 1 7 0v17H9V19Z" fill="#38bdf8"/>
        <rect x="9" y="24" width="7" height="12" fill="#cbd5e1"/>
        <path d="M20.5 16a3.5 3.5 0 0 1 7 0v20h-7V16Z" fill="#38bdf8"/>
        <rect x="20.5" y="22" width="7" height="14" fill="#cbd5e1"/>
        <path d="M32 19a3.5 3.5 0 0 1 7 0v17h-7V19Z" fill="#38bdf8"/>
        <rect x="32" y="24" width="7" height="12" fill="#cbd5e1"/>
      </g>`,
    );
  }
  if (ammoType === 'PISTOL') {
    return svgWrap(
      '0 0 48 48',
      `<g stroke="#0f172a" stroke-width="1.5" stroke-linejoin="round">
        <path d="M11 21a4 4 0 0 1 8 0v14h-8V21Z" fill="#e2e8f0"/>
        <rect x="11" y="25" width="8" height="10" fill="#fbbf24"/>
        <path d="M29 19a4 4 0 0 1 8 0v16h-8V19Z" fill="#e2e8f0"/>
        <rect x="29" y="24" width="8" height="11" fill="#fbbf24"/>
      </g>`,
    );
  }
  // AR
  return svgWrap(
    '0 0 48 48',
    `<g stroke="#0f172a" stroke-width="1.5" stroke-linejoin="round">
      <path d="M10 20 13 9l3 11v17h-6V20Z" fill="#f59e0b"/>
      <rect x="10" y="23" width="6" height="14" fill="#fbbf24"/>
      <path d="M21 17 24 6l3 11v20h-6V17Z" fill="#f59e0b"/>
      <rect x="21" y="21" width="6" height="16" fill="#fbbf24"/>
      <path d="M32 20 35 9l3 11v17h-6V20Z" fill="#f59e0b"/>
      <rect x="32" y="23" width="6" height="14" fill="#fbbf24"/>
    </g>`,
  );
}

export function getArmorSvg(level: 0 | 1 | 2 | 3): string {
  const fill =
    level === 3
      ? '#f59e0b'
      : level === 2
        ? '#38bdf8'
        : level === 1
          ? '#94a3b8'
          : '#475569';
  const trim =
    level === 3 ? '#fef08a' : level === 2 ? '#bae6fd' : level === 1 ? '#e2e8f0' : '#64748b';
  const opacity = level === 0 ? '0.42' : '0.94';

  return svgWrap(
    '0 0 48 48',
    `<path d="M14 8h6l4 5 4-5h6l5 8-4 5v18H13V21l-4-5 5-8Z" fill="${fill}" fill-opacity="${opacity}" stroke="#0f172a" stroke-width="2" stroke-linejoin="round"/>
     <path d="M18 19h12v13H18z" fill="#0f172a" fill-opacity="0.35" stroke="${trim}" stroke-width="1.5"/>
     ${level >= 2 ? `<path d="M10 13l4-3v9l-4-2v-4Zm28 0-4-3v9l4-2v-4Z" fill="${trim}"/>` : ''}
     ${level === 3 ? `<polygon points="24,21 28,25 24,29 20,25" fill="${trim}"/>` : ''}`,
  );
}

export function getHelmetSvg(level: 0 | 1 | 2 | 3): string {
  const fill =
    level === 3
      ? '#f59e0b'
      : level === 2
        ? '#38bdf8'
        : level === 1
          ? '#94a3b8'
          : '#475569';
  const visor =
    level === 3 ? '#fef08a' : level === 2 ? '#7dd3fc' : '#cbd5e1';
  const opacity = level === 0 ? '0.42' : '0.95';

  return svgWrap(
    '0 0 48 48',
    `<path d="M8 26c0-9.5 7-17 16-17s16 7.5 16 17v4l-5 4H13l-5-4v-4Z" fill="${fill}" fill-opacity="${opacity}" stroke="#0f172a" stroke-width="2" stroke-linejoin="round"/>
     <path d="M12 24h24v6c-3 2-7 3-12 3s-9-1-12-3v-6Z" fill="#0f172a" fill-opacity="0.55" stroke="${visor}" stroke-width="1.5"/>
     ${level >= 2 ? `<rect x="15" y="25" width="18" height="4.5" rx="1.5" fill="${visor}"/>` : ''}
     ${level === 3 ? `<path d="M21 9h6v7h-6z" fill="${visor}"/>` : ''}`,
  );
}

export function getBackpackSvg(level: 0 | 1 | 2 | 3): string {
  const fill =
    level === 3
      ? '#f59e0b'
      : level === 2
        ? '#38bdf8'
        : level === 1
          ? '#b45309'
          : '#64748b';
  const trim = level === 3 ? '#fef08a' : level === 2 ? '#bae6fd' : '#fcd34d';

  return svgWrap(
    '0 0 48 48',
    `<path d="M18 11V8a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v3" stroke="${trim}" stroke-width="2.5" stroke-linecap="round"/>
     <rect x="11" y="11" width="26" height="30" rx="6" fill="${fill}" fill-opacity="0.92" stroke="#0f172a" stroke-width="2"/>
     <path d="M11 21h26" stroke="#0f172a" stroke-width="2"/>
     <rect x="16" y="25" width="16" height="11" rx="2.5" fill="#0f172a" fill-opacity="0.32" stroke="${trim}" stroke-width="1.5"/>
     <rect x="21" y="18" width="6" height="5" rx="1" fill="${trim}"/>`,
  );
}

export function getScopeSvg(level: 2 | 4 | 6 | 8): string {
  const accent = level >= 8 ? '#f59e0b' : level >= 4 ? '#38bdf8' : '#22c55e';
  if (level <= 2) {
    return svgWrap(
      '0 0 48 48',
      `<rect x="12" y="16" width="24" height="15" rx="3" fill="#cbd5e1" stroke="#0f172a" stroke-width="2"/>
       <circle cx="24" cy="23.5" r="4.5" fill="#0f172a" stroke="${accent}" stroke-width="2"/>
       <circle cx="24" cy="23.5" r="1.4" fill="${accent}"/>
       <rect x="16" y="31" width="16" height="4" rx="1" fill="#64748b"/>`,
    );
  }
  return svgWrap(
    '0 0 48 48',
    `<path d="M6 19h8l4-3h12l4-2h8v17h-8l-4-2H18l-4-3H6v-7Z" fill="#cbd5e1" stroke="#0f172a" stroke-width="2" stroke-linejoin="round"/>
     <rect x="21" y="11" width="6" height="5" rx="1" fill="${accent}" stroke="#0f172a" stroke-width="1.4"/>
     <circle cx="40" cy="22.5" r="5" fill="#0f172a" stroke="${accent}" stroke-width="2"/>
     <rect x="17" y="30" width="14" height="4" rx="1" fill="#64748b"/>`,
  );
}

export function getLootItemSvg(def: LootItemDefinition): string {
  if (def.category === 'weapon' || def.weaponId) {
    return getWeaponSvg(def.weaponId, '#f8fafc');
  }
  if (def.category === 'ammo') {
    return getAmmoSvg(def.ammoType ?? 'AR');
  }
  if (def.category === 'armor') {
    return getArmorSvg((def.armorLevel ?? 1) as 1 | 2 | 3);
  }
  if (def.category === 'helmet') {
    return getHelmetSvg((def.helmetLevel ?? 1) as 1 | 2 | 3);
  }
  if (def.category === 'backpack') {
    return getBackpackSvg((def.backpackLevel ?? 1) as 1 | 2 | 3);
  }
  if (def.category === 'scope') {
    return getScopeSvg((def.scopeLevel ?? 2) as 2 | 4 | 6 | 8);
  }

  switch (def.id) {
    case 'med_bandage':
      return svgWrap(
        '0 0 48 48',
        `<circle cx="21" cy="24" r="12" fill="#f8fafc" stroke="#0f172a" stroke-width="2"/>
         <circle cx="21" cy="24" r="5" fill="#22c55e" stroke="#0f172a" stroke-width="1.6"/>
         <path d="M29 29h12v7H25" fill="#e2e8f0" stroke="#0f172a" stroke-width="2" stroke-linejoin="round"/>
         <path d="M21 15v4M21 29v4" stroke="#22c55e" stroke-width="2.2" stroke-linecap="round"/>`,
      );
    case 'med_kit':
      return svgWrap(
        '0 0 48 48',
        `<path d="M18 13v-3a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3" stroke="#cbd5e1" stroke-width="2.5"/>
         <rect x="7" y="13" width="34" height="26" rx="4" fill="#10b981" stroke="#0f172a" stroke-width="2"/>
         <path d="M21 19h6v5h5v6h-5v5h-6v-5h-5v-6h5v-5Z" fill="#ffffff"/>`,
      );
    case 'shield_cell':
      return svgWrap(
        '0 0 48 48',
        `<rect x="16" y="7" width="16" height="5" rx="1.5" fill="#cbd5e1" stroke="#0f172a" stroke-width="1.6"/>
         <rect x="13" y="12" width="22" height="28" rx="4" fill="#0284c7" stroke="#0f172a" stroke-width="2"/>
         <path d="M26 17l-7 10h5l-2 8 7-10h-5l2-8Z" fill="#bae6fd"/>`,
      );
    case 'shield_battery':
      return svgWrap(
        '0 0 48 48',
        `<rect x="11" y="7" width="9" height="5" rx="1" fill="#e2e8f0" stroke="#0f172a" stroke-width="1.5"/>
         <rect x="28" y="7" width="9" height="5" rx="1" fill="#e2e8f0" stroke="#0f172a" stroke-width="1.5"/>
         <rect x="8" y="12" width="32" height="29" rx="4" fill="#0ea5e9" stroke="#0f172a" stroke-width="2"/>
         <path d="M26 16l-8 11h6l-2 9 8-11h-6l2-9Z" fill="#ffffff"/>`,
      );
    case 'special_adrenaline':
      return svgWrap(
        '0 0 48 48',
        `<g transform="rotate(-35 24 24)">
           <rect x="21" y="5" width="6" height="4" rx="1" fill="#e2e8f0"/>
           <line x1="24" y1="9" x2="24" y2="14" stroke="#cbd5e1" stroke-width="2.5"/>
           <rect x="18" y="14" width="12" height="20" rx="2.5" fill="#a855f7" stroke="#0f172a" stroke-width="2"/>
           <rect x="20" y="19" width="8" height="12" fill="#f0abfc"/>
           <line x1="24" y1="34" x2="24" y2="44" stroke="#f8fafc" stroke-width="2.2" stroke-linecap="round"/>
         </g>`,
      );
    case 'special_recon_chip':
      return svgWrap(
        '0 0 48 48',
        `<rect x="13" y="13" width="22" height="22" rx="3" fill="#7c3aed" stroke="#0f172a" stroke-width="2"/>
         <circle cx="24" cy="24" r="6" stroke="#f0abfc" stroke-width="2"/>
         <circle cx="24" cy="24" r="2.2" fill="#ffffff"/>
         <path d="M18 7v6M24 7v6M30 7v6M18 35v6M24 35v6M30 35v6M7 18h6M7 24h6M7 30h6M35 18h6M35 24h6M35 30h6" stroke="#c084fc" stroke-width="2.2" stroke-linecap="round"/>`,
      );
    case 'utility_repair_kit':
      return svgWrap(
        '0 0 48 48',
        `<rect x="8" y="12" width="32" height="26" rx="4" fill="#0d9488" stroke="#0f172a" stroke-width="2"/>
         <path d="M29 18a6 6 0 0 0-7.5 7.5L15 32l3 3 6.5-6.5A6 6 0 0 0 32 21l-3.5 3.5-2.5-2.5L29 18Z" fill="#f8fafc"/>`,
      );
    case 'utility_kevlar_plate':
      return svgWrap(
        '0 0 48 48',
        `<polygon points="24,6 39,14 39,34 24,42 9,34 9,14" fill="#0284c7" stroke="#0f172a" stroke-width="2"/>
         <polygon points="24,12 33,17 33,31 24,36 15,31 15,17" fill="#38bdf8" stroke="#bae6fd" stroke-width="1.5"/>`,
      );
    case 'utility_energy_drink':
      return svgWrap(
        '0 0 48 48',
        `<rect x="15" y="9" width="18" height="30" rx="3.5" fill="#06b6d4" stroke="#0f172a" stroke-width="2"/>
         <rect x="17" y="7" width="14" height="3.5" rx="1" fill="#e2e8f0"/>
         <path d="M26 15l-6 9h5l-2 9 7-10h-5l1-8Z" fill="#fef08a"/>`,
      );
    case 'utility_ammo_pouch':
      return svgWrap(
        '0 0 48 48',
        `<rect x="9" y="14" width="30" height="24" rx="4" fill="#b45309" stroke="#0f172a" stroke-width="2"/>
         <path d="M16 10v16M24 10v16M32 10v16" stroke="#fbbf24" stroke-width="4" stroke-linecap="round"/>
         <rect x="9" y="23" width="30" height="5" fill="#78350f"/>`,
      );
    case 'gloo_wall':
      return getGlooWallSvg();
    default:
      return svgWrap(
        '0 0 48 48',
        `<polygon points="24,6 40,15 40,33 24,42 8,33 8,15" fill="${def.accentHex}" stroke="#0f172a" stroke-width="2"/>`,
      );
  }
}

export function getGlooWallSvg(): string {
  return svgWrap(
    '0 0 48 48',
    `<path d="M8 15c5-4 10.5-6 16-6s11 2 16 6v19c-5-3.2-10.5-4.8-16-4.8S13 30.8 8 34V15Z" fill="#0ea5e9" fill-opacity="0.88" stroke="#bae6fd" stroke-width="2" stroke-linejoin="round"/>
     <path d="M16 10.5v20M32 10.5v20M24 9v20.2" stroke="#e0f2fe" stroke-width="1.8" stroke-linecap="round"/>
     <path d="M12 18l5-4M27 22l7-5M15 26l4-3" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"/>`,
  );
}

export function getFireBulletActionSvg(): string {
  return svgWrap(
    '0 0 32 32',
    `<g transform="rotate(-45 16 16)">
       <path d="M12.5 14h7v10.5c0 .9-.7 1.5-1.5 1.5h-4c-.8 0-1.5-.6-1.5-1.5V14Z" fill="currentColor"/>
       <path d="M12.5 14c0-4.2 1.8-7.4 3.5-8.8 1.7 1.4 3.5 4.6 3.5 8.8h-7Z" fill="currentColor" fill-opacity="0.92"/>
       <rect x="12.2" y="13.3" width="7.6" height="1.4" rx="0.6" fill="#0f172a"/>
       <path d="M10.5 7.5 8.5 5M21.5 7.5 23.5 5M9.5 11.5H6.5M22.5 11.5h3" stroke="#fbbf24" stroke-width="1.8" stroke-linecap="round"/>
     </g>`,
  );
}

export function getHudActionSvg(action: HudActionSlotId): string {
  switch (action) {
    case 'fire':
      return getFireBulletActionSvg();
    case 'aim':
      return svgWrap(
        '0 0 32 32',
        `<circle cx="16" cy="16" r="10.5" stroke="currentColor" stroke-width="2"/>
         <circle cx="16" cy="16" r="5" stroke="#38bdf8" stroke-width="1.5"/>
         <path d="M16 3v6M16 23v6M3 16h6M23 16h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
         <circle cx="16" cy="16" r="1.8" fill="#f97316"/>`,
      );
    case 'jump':
      return svgWrap(
        '0 0 32 32',
        `<circle cx="16" cy="7.5" r="2.8" fill="currentColor"/>
         <path d="M16 11.5v7.5m0-6-5 3.5m5-3.5 5 3.5m-5 2.5-4.5 6.5m4.5-6.5 4.5 5.5" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
         <path d="M6 12l4-5 4 5" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
      );
    case 'sprint':
      return svgWrap(
        '0 0 32 32',
        `<circle cx="19" cy="7" r="2.6" fill="currentColor"/>
         <path d="M17.5 11.5 13 18l-5.5 2m10-8.5 5.5 3-2.5 4.5m-7.5-1 5 3.5-2 7m-4.5-6.5-5 7" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
         <path d="M5 12h4.5M4 16h4" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"/>`,
      );
    case 'crouch':
      return svgWrap(
        '0 0 32 32',
        `<circle cx="17" cy="9.5" r="2.6" fill="currentColor"/>
         <path d="M16.5 13 13 19.5l6.5 1.5-2.5 6m-1-13.5 6 2.5-3.5 3.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
         <path d="M6 27h20" stroke="#94a3b8" stroke-width="1.8" stroke-linecap="round"/>`,
      );
    case 'prone':
      return svgWrap(
        '0 0 32 32',
        `<circle cx="24.5" cy="18.5" r="2.6" fill="currentColor"/>
         <path d="M5 23h16l3-3.5m-10 3.5 4-4.5 5 2" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
         <path d="M20 15.5h8.5" stroke="#38bdf8" stroke-width="2" stroke-linecap="round"/>
         <path d="M4 26.5h24" stroke="#94a3b8" stroke-width="1.8" stroke-linecap="round"/>`,
      );
    case 'reload':
      return svgWrap(
        '0 0 32 32',
        `<path d="M25.5 15a9.5 9.5 0 1 1-3-6.9" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/>
         <polygon points="26,5.5 26,11.5 20,11.5" fill="currentColor"/>
         <path d="M14 14.5 16 10l2 4.5V22h-4v-7.5Z" fill="#f59e0b"/>`,
      );
    case 'weaponSwitch':
      return svgWrap(
        '0 0 32 32',
        `<path d="M7 11h16l-3.5-3.5M25 21H9l3.5 3.5" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
         <rect x="9" y="14.5" width="14" height="3" rx="1" fill="#38bdf8"/>`,
      );
    case 'holster':
      return getHolsterSvg();
    case 'pickup':
      return svgWrap(
        '0 0 32 32',
        `<rect x="8" y="13" width="16" height="13" rx="2.5" fill="#f59e0b" fill-opacity="0.24" stroke="currentColor" stroke-width="2"/>
         <path d="M16 5v11m-4-4 4 4 4-4" stroke="#f59e0b" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>`,
      );
    case 'drop':
      return svgWrap(
        '0 0 32 32',
        `<path d="M16 5v14m-4.5-4.5L16 19l4.5-4.5" stroke="#f43f5e" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>
         <path d="M7 24.5h18" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/>`,
      );
    case 'ability':
      return svgWrap(
        '0 0 32 32',
        `<polygon points="16,3 19.8,11.5 29,12.2 22,18.2 24.2,27 16,22.2 7.8,27 10,18.2 3,12.2 12.2,11.5" fill="#f59e0b" fill-opacity="0.3" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>`,
      );
    case 'glooWall':
      return svgWrap(
        '0 0 32 32',
        `<path d="M5 10c3.5-2.8 7.2-4 11-4s7.5 1.2 11 4v14c-3.5-2.2-7.2-3.4-11-3.4S8.5 21.8 5 24V10Z" fill="#38bdf8" fill-opacity="0.35" stroke="#bae6fd" stroke-width="2" stroke-linejoin="round"/>
         <path d="M11 7.2v14M21 7.2v14M16 6v14.5" stroke="#e0f2fe" stroke-width="1.5" stroke-linecap="round"/>`,
      );
    case 'inventory':
      return getBackpackSvg(2);
    case 'minimap':
      return svgWrap(
        '0 0 32 32',
        `<polygon points="4,8 12,5 20,8 28,5 28,24 20,27 12,24 4,27" fill="#0ea5e9" fill-opacity="0.18" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
         <path d="M12 5v19M20 8v19" stroke="currentColor" stroke-width="1.6"/>
         <circle cx="16" cy="15" r="2.2" fill="#f97316"/>`,
      );
  }
}

export function getHealthHudSvg(): string {
  return svgWrap(
    '0 0 48 48',
    `<path d="M24 41s-14-8.8-14-19.2C10 15.2 15 10 21 10c2.9 0 5.5 1.4 7 3.6C29.5 11.4 32.1 10 35 10c6 0 11 5.2 11 11.8C46 32.2 32 41 24 41Z" transform="translate(-4 0)" fill="#10b981" fill-opacity="0.92" stroke="#0f172a" stroke-width="2" stroke-linejoin="round"/>
     <path d="M21 18h6v4h4v5h-4v4h-6v-4h-4v-5h4v-4Z" fill="#ffffff"/>`,
  );
}

export function getTrashSvg(open = false): string {
  if (open) {
    return svgWrap(
      '0 0 48 48',
      `<g transform="rotate(-18 14 14)">
         <rect x="10" y="9" width="28" height="4.5" rx="1.5" fill="#f43f5e" stroke="#0f172a" stroke-width="1.5"/>
         <path d="M19 9V6.5a1.5 1.5 0 0 1 1.5-1.5h7a1.5 1.5 0 0 1 1.5 1.5V9" stroke="#fda4af" stroke-width="2"/>
       </g>
       <path d="M12 18h24l-2.5 23a2.5 2.5 0 0 1-2.5 2.2H17a2.5 2.5 0 0 1-2.5-2.2L12 18Z" fill="#e11d48" fill-opacity="0.9" stroke="#0f172a" stroke-width="2" stroke-linejoin="round"/>
       <path d="M19 23v14M24 23v14M29 23v14" stroke="#fecdd3" stroke-width="2.2" stroke-linecap="round"/>`,
    );
  }
  return svgWrap(
    '0 0 48 48',
    `<rect x="10" y="11" width="28" height="4.5" rx="1.5" fill="#94a3b8" stroke="#0f172a" stroke-width="1.5"/>
     <path d="M19 11V8a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 29 8v3" stroke="#cbd5e1" stroke-width="2"/>
     <path d="M12 16h24l-2.5 24a2.5 2.5 0 0 1-2.5 2.2H17a2.5 2.5 0 0 1-2.5-2.2L12 16Z" fill="#475569" stroke="#0f172a" stroke-width="2" stroke-linejoin="round"/>
     <path d="M19 22v14M24 22v14M29 22v14" stroke="#cbd5e1" stroke-width="2.2" stroke-linecap="round"/>`,
  );
}

export function getEditHudSvg(): string {
  return svgWrap(
    '0 0 24 24',
    `<rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2"/>
     <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2"/>
     <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="2"/>
     <path d="M14.5 17.5h6M17.5 14.5v6" stroke="#f97316" stroke-width="2.2" stroke-linecap="round"/>`,
  );
}

export function getEmptyWeaponSlotSvg(): string {
  return svgWrap(
    '0 0 64 32',
    `<path d="M10 14h24l3 2h15v2.5H37l-2 2H24l-1.5 4.5h-4l1.2-4.5H13l-3 3.5v-10Z" stroke="#64748b" stroke-width="1.6" stroke-dasharray="3 2" stroke-linejoin="round"/>`,
  );
}

export function getOperatorIconSvg(): string {
  return svgWrap(
    '0 0 24 24',
    `<circle cx="12" cy="7.5" r="3.6" stroke="currentColor" stroke-width="2"/>
     <path d="M5 20c0-3.7 3.1-6.2 7-6.2s7 2.5 7 6.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
     <path d="M8.8 7.5h6.4" stroke="#38bdf8" stroke-width="1.8" stroke-linecap="round"/>`,
  );
}

export function getGenderIconSvg(gender: 'male' | 'female'): string {
  if (gender === 'female') {
    return svgWrap(
      '0 0 24 24',
      `<circle cx="12" cy="9" r="5" stroke="currentColor" stroke-width="2.1"/>
       <path d="M12 14v7M9 18h6" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>`,
    );
  }
  return svgWrap(
    '0 0 24 24',
    `<circle cx="10" cy="14" r="5" stroke="currentColor" stroke-width="2.1"/>
     <path d="M13.8 10.2 19 5M14.5 5H19v4.5" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
}

export function getCustomizeIconSvg(): string {
  return svgWrap(
    '0 0 24 24',
    `<path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
     <circle cx="9" cy="7" r="2.2" fill="#f97316" stroke="currentColor" stroke-width="1.5"/>
     <circle cx="16" cy="12" r="2.2" fill="#38bdf8" stroke="currentColor" stroke-width="1.5"/>
     <circle cx="10" cy="17" r="2.2" fill="#f97316" stroke="currentColor" stroke-width="1.5"/>`,
  );
}

export function getShopCrateSvg(): string {
  return svgWrap(
    '0 0 24 24',
    `<path d="M4 9l8-4 8 4v9l-8 4-8-4V9Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
     <path d="M4 9l8 4 8-4M12 13v9" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
     <path d="M9 6.5l8 4" stroke="#f59e0b" stroke-width="1.8"/>`,
  );
}

export function getSettingsCogSvg(): string {
  return svgWrap(
    '0 0 24 24',
    `<circle cx="12" cy="12" r="3.2" stroke="currentColor" stroke-width="2"/>
     <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>`,
  );
}

export function getAudioToggleSvg(muted: boolean): string {
  if (muted) {
    return svgWrap(
      '0 0 24 24',
      `<path d="M11 5 6 9H3v6h3l5 4V5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
       <path d="M22 9l-6 6M16 9l6 6" stroke="#f43f5e" stroke-width="2.2" stroke-linecap="round"/>`,
    );
  }
  return svgWrap(
    '0 0 24 24',
    `<path d="M11 5 6 9H3v6h3l5 4V5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
     <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9.5 9.5 0 0 1 0 13" stroke="#38bdf8" stroke-width="2" stroke-linecap="round"/>`,
  );
}

export function getMapGlobeSvg(): string {
  return svgWrap(
    '0 0 24 24',
    `<polygon points="3,6 9,3.5 15,6 21,3.5 21,18 15,20.5 9,18 3,20.5" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/>
     <path d="M9 3.5V18M15 6v14.5" stroke="currentColor" stroke-width="1.6"/>
     <circle cx="15" cy="11" r="2.1" fill="#f97316"/>`,
  );
}

export function getBattleRoyaleModeSvg(): string {
  return svgWrap(
    '0 0 24 24',
    `<circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="2"/>
     <circle cx="12" cy="12" r="3" fill="#38bdf8"/>
     <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  );
}

export function getRankedShieldSvg(): string {
  return svgWrap(
    '0 0 24 24',
    `<path d="M12 3 4.5 6.2v5.6c0 4.9 3.2 8.7 7.5 10.2 4.3-1.5 7.5-5.3 7.5-10.2V6.2L12 3Z" fill="#f59e0b" fill-opacity="0.2" stroke="#f59e0b" stroke-width="2" stroke-linejoin="round"/>
     <polygon points="12,7.5 13.6,10.7 17,11.2 14.5,13.6 15.1,17 12,15.3 8.9,17 9.5,13.6 7,11.2 10.4,10.7" fill="#fbbf24"/>`,
  );
}

export function getPracticeTargetSvg(): string {
  return svgWrap(
    '0 0 24 24',
    `<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/>
     <circle cx="12" cy="12" r="5" stroke="#34d399" stroke-width="2"/>
     <circle cx="12" cy="12" r="2" fill="#34d399"/>`,
  );
}

export function getPlayDeploySvg(): string {
  return svgWrap(
    '0 0 24 24',
    `<polygon points="6,4 20,12 6,20" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>`,
  );
}

export function getRotateSvg(dir: 'left' | 'right'): string {
  if (dir === 'left') {
    return svgWrap(
      '0 0 24 24',
      `<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4 9.5" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
       <polyline points="4,4.5 4,9.5 9,9.5" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
  }
  return svgWrap(
    '0 0 24 24',
    `<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3L20 9.5" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
     <polyline points="20,4.5 20,9.5 15,9.5" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
}

export function getAutoSpinSvg(): string {
  return svgWrap(
    '0 0 24 24',
    `<path d="M17 2.5 20.5 6 17 9.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
     <path d="M3.5 11v-1a4 4 0 0 1 4-4h13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
     <path d="M7 21.5 3.5 18 7 14.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
     <path d="M20.5 13v1a4 4 0 0 1-4 4h-13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
  );
}

export function getExportGlbSvg(): string {
  return svgWrap(
    '0 0 24 24',
    `<path d="M12 3v11m-4-4 4 4 4-4" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
     <path d="M4 15v3.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V15" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>`,
  );
}

export function getPetCompanionSvg(): string {
  return svgWrap(
    '0 0 24 24',
    `<circle cx="6.2" cy="9" r="2.1" fill="#38bdf8" stroke="currentColor" stroke-width="1.3"/>
     <circle cx="10" cy="6" r="2.1" fill="#38bdf8" stroke="currentColor" stroke-width="1.3"/>
     <circle cx="14" cy="6" r="2.1" fill="#38bdf8" stroke="currentColor" stroke-width="1.3"/>
     <circle cx="17.8" cy="9" r="2.1" fill="#38bdf8" stroke="currentColor" stroke-width="1.3"/>
     <path d="M7.5 16.6c0-2.6 2-4.6 4.5-4.6s4.5 2 4.5 4.6c0 1.9-1.4 3.4-3.1 3.4-.7 0-1.1-.3-1.4-.3s-.7.3-1.4.3c-1.7 0-3.1-1.5-3.1-3.4Z" fill="#f59e0b" fill-opacity="0.88" stroke="currentColor" stroke-width="1.5"/>`,
  );
}

export function getAlivePersonSvg(): string {
  return svgWrap(
    '0 0 24 24',
    `<circle cx="12" cy="7.5" r="3.4" fill="currentColor"/>
     <path d="M5.5 20c0-3.8 2.9-6.2 6.5-6.2s6.5 2.4 6.5 6.2H5.5Z" fill="currentColor"/>`,
  );
}

export function getElimSkullSvg(): string {
  return svgWrap(
    '0 0 24 24',
    `<path d="M12 3.5c-4.4 0-7.5 3.1-7.5 7 0 2.5 1.2 4.4 3 5.5v2.8c0 .8.6 1.4 1.4 1.4h6.2c.8 0 1.4-.6 1.4-1.4V16c1.8-1.1 3-3 3-5.5 0-3.9-3.1-7-7.5-7Z" fill="currentColor"/>
     <circle cx="9.4" cy="10.8" r="1.5" fill="#0f172a"/>
     <circle cx="14.6" cy="10.8" r="1.5" fill="#0f172a"/>
     <path d="M10.5 17.5v2.2M13.5 17.5v2.2" stroke="#0f172a" stroke-width="1.5" stroke-linecap="round"/>`,
  );
}

export function getZoneWarningTriangleSvg(): string {
  return svgWrap(
    '0 0 24 24',
    `<path d="M12 3.2 21.5 20H2.5L12 3.2Z" fill="#ef4444" stroke="#ffffff" stroke-width="1.4" stroke-linejoin="round"/>
     <path d="M12 9.2v5.4" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round"/>
     <circle cx="12" cy="17.2" r="1.2" fill="#ffffff"/>`,
  );
}

export function getClockTimerSvg(): string {
  return svgWrap(
    '0 0 24 24',
    `<circle cx="12" cy="13" r="8" stroke="currentColor" stroke-width="2"/>
     <path d="M12 9v4.2l2.8 1.8M9.5 3h5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
}

export function getEmoteWheelTriggerSvg(): string {
  return svgWrap(
    '0 0 24 24',
    `<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.9"/>
     <circle cx="12" cy="12" r="3.2" fill="#f97316"/>
     <path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21M5.6 5.6l2.5 2.5M15.9 15.9l2.5 2.5M18.4 5.6l-2.5 2.5M8.1 15.9l-2.5 2.5" stroke="#38bdf8" stroke-width="1.7" stroke-linecap="round"/>`,
  );
}

export function getStopEmoteSvg(): string {
  return svgWrap(
    '0 0 24 24',
    `<rect x="6" y="6" width="12" height="12" rx="2.5" fill="currentColor"/>`,
  );
}

export function getEmoteSvg(iconKind: EmoteIconKind, accentHex = '#38bdf8'): string {
  switch (iconKind) {
    case 'floss':
      return svgWrap(
        '0 0 48 48',
        `<circle cx="24" cy="9.5" r="3.5" fill="#f8fafc"/>
         <path d="M24 14v11m-11-3 22-4m-11 7-5 12m5-12 5 12" stroke="#f8fafc" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
         <path d="M9 17c3-2 6-2 9 0M30 24c3 2 6 2 9 0" stroke="${accentHex}" stroke-width="2.4" stroke-linecap="round"/>`,
      );
    case 'takeTheL':
      return svgWrap(
        '0 0 48 48',
        `<circle cx="23" cy="11" r="3.4" fill="#f8fafc"/>
         <path d="M23 15.5V27m0-9 6-5V7h4m-10 11-6 4 2 4m4 1-6 8-4-2m10-6 5 11" stroke="#f8fafc" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"/>
         <path d="M31 6v7h5" stroke="${accentHex}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
      );
    case 'orangeJustice':
      return svgWrap(
        '0 0 48 48',
        `<circle cx="24" cy="10.5" r="3.5" fill="#f8fafc"/>
         <path d="M24 15v10m0-8-9-5m9 5 8 5-5 4m-3-1-7 6 3 6m4-12 7 6-3 6" stroke="#f8fafc" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
         <path d="M11 8l4 3m22 4-4-2M12 37h24" stroke="${accentHex}" stroke-width="2.3" stroke-linecap="round"/>`,
      );
    case 'renegade':
      return svgWrap(
        '0 0 48 48',
        `<circle cx="24" cy="10" r="3.5" fill="#f8fafc"/>
         <path d="M24 14.5V26m0-9-7 3-2-6m9 3 7-4 3 5m-10 8-5 12m5-12 6 12" stroke="#f8fafc" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"/>
         <circle cx="14" cy="11" r="2.2" fill="${accentHex}"/>
         <circle cx="35" cy="15" r="2.2" fill="${accentHex}"/>`,
      );
    case 'griddy':
      return svgWrap(
        '0 0 48 48',
        `<circle cx="24" cy="10.5" r="3.5" fill="#f8fafc"/>
         <path d="M24 15v11m0-9-7-3-2-3m9 6 7-3 2-3m-9 12-7 6 2 5m5-11 6 11" stroke="#f8fafc" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
         <circle cx="20.5" cy="10.5" r="2.4" stroke="${accentHex}" stroke-width="1.8" fill="none"/>
         <circle cx="27.5" cy="10.5" r="2.4" stroke="${accentHex}" stroke-width="1.8" fill="none"/>`,
      );
    case 'gangnamStyle':
      return svgWrap(
        '0 0 48 48',
        `<circle cx="24" cy="12" r="3.5" fill="#f8fafc"/>
         <path d="M24 16.5V27m0-8-6 4 6 2m0-6 7-7 4-3m-11 18-7 5 2 6m5-11 7 5-2 6" stroke="#f8fafc" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
         <ellipse cx="35" cy="7" rx="5.5" ry="2.2" stroke="${accentHex}" stroke-width="2" fill="none"/>`,
      );
    case 'macarena':
      return svgWrap(
        '0 0 48 48',
        `<circle cx="24" cy="10" r="3.5" fill="#f8fafc"/>
         <path d="M24 14.5V27m0-9-7 3 7 3m0-6 7 3-7 3m0 3-5 12m5-12 5 12" stroke="#f8fafc" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
         <path d="M12 29c3 3 7 3 9 0M27 29c2 3 6 3 9 0" stroke="${accentHex}" stroke-width="2.3" stroke-linecap="round"/>`,
      );
    case 'electroShuffle':
      return svgWrap(
        '0 0 48 48',
        `<circle cx="24" cy="9.5" r="3.5" fill="#f8fafc"/>
         <path d="M24 14v11m0-8-8 5m8-5 8-3m-8 11-7 7 5 5m2-12 7 7-5 5" stroke="#f8fafc" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"/>
         <path d="M11 40h8M29 40h8" stroke="${accentHex}" stroke-width="2.6" stroke-linecap="round"/>`,
      );
  }
}

export function getFriendsPersonSvg(): string {
  return svgWrap(
    '0 0 24 24',
    `<circle cx="9.5" cy="7.5" r="3.4" stroke="currentColor" stroke-width="1.9"/>
     <path d="M3.5 19.5c0-3.2 2.7-5.3 6-5.3s6 2.1 6 5.3" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
     <circle cx="17.2" cy="8.8" r="2.2" stroke="#38bdf8" stroke-width="1.6"/>
     <path d="M16.2 14.8c2.2.4 4.1 1.9 4.3 4.4" stroke="#38bdf8" stroke-width="1.7" stroke-linecap="round"/>`,
  );
}

export function getMailEnvelopeSvg(): string {
  return svgWrap(
    '0 0 24 24',
    `<rect x="3" y="5.5" width="18" height="13" rx="2.2" stroke="currentColor" stroke-width="1.9"/>
     <path d="M4.2 7l7.8 5.6L19.8 7" stroke="#38bdf8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
}

export function getCurrencyCoinSvg(): string {
  return svgWrap(
    '0 0 24 24',
    `<defs>
       <linearGradient id="nxCoinGrad" x1="0" y1="0" x2="1" y2="1">
         <stop offset="0%" stop-color="#fde047"/>
         <stop offset="50%" stop-color="#f59e0b"/>
         <stop offset="100%" stop-color="#d97706"/>
       </linearGradient>
     </defs>
     <polygon points="12,2.2 20.5,7.1 20.5,16.9 12,21.8 3.5,16.9 3.5,7.1" fill="url(#nxCoinGrad)" stroke="#fef08a" stroke-width="1.3" stroke-linejoin="round"/>
     <polygon points="12,5.3 17.8,8.6 17.8,15.4 12,18.7 6.2,15.4 6.2,8.6" fill="#0f172a" fill-opacity="0.35" stroke="#fde68a" stroke-opacity="0.65" stroke-width="0.9"/>
     <path d="M9.3 15.2V8.8l5.4 6.4V8.8" stroke="#fef9c3" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
}

export function getPlusIconSvg(): string {
  return svgWrap(
    '0 0 20 20',
    `<path d="M10 4.5v11M4.5 10h11" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`,
  );
}




