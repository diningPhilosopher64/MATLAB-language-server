import { Position } from 'vscode-languageserver'

/**
 * Determines whether a position is less than another position.
 *
 * @param a The first position
 * @param b The second position
 * @param orEqual Whether a "less than or equal" check should be performed
 * @returns true if position A is before position B
 */
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

/**
 * Determines whether a position is greater than another position.
 *
 * @param a The first position
 * @param b The second position
 * @param orEqual Whether a "greater than or equal" check should be performed
 * @returns True if position A is after position B
 */
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
