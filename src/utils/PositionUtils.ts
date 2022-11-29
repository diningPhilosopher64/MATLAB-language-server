import { Position } from 'vscode-languageserver'

export function isPositionLessThan (a: Position, b: Position, orEqual = false): boolean {
    if (a.line < b.line) {
        return true
    }

    if (a.line === b.line) {
        return orEqual
            ? a.character <= b.character
            : a.character < b.character
    }

    return false
}

export function isPositionGreaterThan (a: Position, b: Position, orEqual = false): boolean {
    if (a.line > b.line) {
        return true
    }

    if (a.line === b.line) {
        return orEqual
            ? a.character >= b.character
            : a.character > b.character
    }

    return false
}
