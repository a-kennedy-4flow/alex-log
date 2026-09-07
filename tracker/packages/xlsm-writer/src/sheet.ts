// Builds the Tracker sheet.
//
// The layout follows the shipped workbook so a reader recognises it. Every
// derived cell is written as a value. The export carries no project list so a
// lookup formula would have nothing to resolve against.

import { esc, STYLE } from './xml'

export type CellValue = string | number | boolean | null

export interface Cell {
  ref: string
  value: CellValue
  style?: number
}

/** Excel counts days from 1899-12-30 once its 1900 leap year fault is absorbed. */
const EXCEL_EPOCH = Date.UTC(1899, 11, 30)

export function toSerial(isoDate: string): number {
  return Math.round((new Date(`${isoDate}T00:00:00Z`).getTime() - EXCEL_EPOCH) / 86400000)
}

export function columnName(index: number): string {
  let n = index
  let out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

export function columnIndex(name: string): number {
  let n = 0
  for (const ch of name) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n
}

function rowOf(ref: string): number {
  return Number(ref.replace(/[^0-9]/g, ''))
}

function colOf(ref: string): string {
  return ref.replace(/[0-9]/g, '')
}

function cellXml(cell: Cell): string {
  const s = cell.style ? ` s="${cell.style}"` : ''
  if (cell.value === null || cell.value === '') return `<c r="${cell.ref}"${s}/>`
  if (typeof cell.value === 'number') return `<c r="${cell.ref}"${s}><v>${cell.value}</v></c>`
  if (typeof cell.value === 'boolean') {
    return `<c r="${cell.ref}"${s} t="b"><v>${cell.value ? 1 : 0}</v></c>`
  }
  // Inline strings avoid a shared string table. The sheet is small so the
  // saving a table would give is not worth the extra part.
  return `<c r="${cell.ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(cell.value)}</t></is></c>`
}

export interface SheetOptions {
  cells: Cell[]
  /** Column widths keyed by column letter. */
  widths: Record<string, number>
  /** Rows to freeze at the top. */
  freezeRows: number
}

export function buildSheet({ cells, widths, freezeRows }: SheetOptions): string {
  const byRow = new Map<number, Cell[]>()
  for (const cell of cells) {
    if (cell.value === null && cell.style === undefined) continue
    const row = rowOf(cell.ref)
    const list = byRow.get(row) ?? []
    list.push(cell)
    byRow.set(row, list)
  }

  const rows = [...byRow.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([row, list]) => {
      const sorted = [...list].sort((a, b) => columnIndex(colOf(a.ref)) - columnIndex(colOf(b.ref)))
      return `<row r="${row}">${sorted.map(cellXml).join('')}</row>`
    })
    .join('')

  const cols = Object.entries(widths)
    .map(([col, width]) => {
      const index = columnIndex(col)
      return `<col min="${index}" max="${index}" width="${width}" customWidth="1"/>`
    })
    .join('')

  const pane = freezeRows
    ? `<pane ySplit="${freezeRows}" topLeftCell="A${freezeRows + 1}" activePane="bottomLeft" state="frozen"/>`
    : ''

  const refs = cells.filter((c) => c.value !== null).map((c) => c.ref)
  const lastRow = refs.length ? Math.max(...refs.map(rowOf)) : 1
  const lastCol = refs.length ? Math.max(...refs.map((r) => columnIndex(colOf(r)))) : 1

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="A1:${columnName(lastCol)}${lastRow}"/>
<sheetViews><sheetView tabSelected="1" workbookViewId="0">${pane}</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
${cols ? `<cols>${cols}</cols>` : ''}
<sheetData>${rows}</sheetData>
<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`
}

export { STYLE }
