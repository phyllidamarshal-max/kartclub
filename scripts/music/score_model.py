"""Small notation model for independently composed scene scores."""
import re

QUALITIES = {'M': (0, 4, 7), 'm': (0, 3, 7), 'm6': (0, 3, 7, 9), '5': (0, 7, 12),
             'M7': (0, 4, 7, 11), 'm7': (0, 3, 7, 10),
             '7': (0, 4, 7, 10), 'sus2': (0, 2, 7), 'sus4': (0, 5, 7)}


def chord_pitches(symbol):
    match = re.fullmatch(r'(-?\d+)(M7|m7|m6|sus2|sus4|M|m|7|5)', symbol)
    if not match:
        raise ValueError(f'Unknown chord: {symbol}')
    root, quality = match.groups()
    return [int(root) + interval for interval in QUALITIES[quality]]


def parse_bar(notation, beats=4):
    events, at = [], 0.0
    for token in notation.split():
        pitch, duration = token.split(':')
        duration = float(duration)
        if duration <= 0:
            raise ValueError('Nonpositive note duration')
        events.append((at, duration, None if pitch == 'r' else int(pitch)))
        at += duration
    if abs(at - beats) > 1e-8:
        raise ValueError(f'Expected {beats} beats, got {at}: {notation}')
    return events


def section(chords, notes):
    rows = [row.strip() for row in notes.strip().splitlines() if row.strip()]
    symbols = chords.split()
    assert len(rows) == len(symbols) == 8
    return {'chords': symbols, 'notes': rows}


def voicing(key, symbol, previous=None):
    pitches = chord_pitches(symbol)
    options = []
    for inversion in range(len(pitches)):
        offsets = pitches[inversion:] + [p + 12 for p in pitches[:inversion]]
        for octave in (-24, -12, 0):
            notes = [key + p + octave for p in offsets]
            if min(notes) >= 43 and max(notes) <= 78 and len(set(notes)) == len(notes):
                options.append(sorted(notes))
    reference = previous or [key - 12, key - 8, key - 5]
    return min(options, key=lambda ns: sum(min(abs(n-p) for p in reference) for n in ns)
               + abs(sum(ns)/len(ns) - 60)*.2)


def bars(score):
    for part_index, part in enumerate(score['form']):
        section_data = score[part]
        for local, (symbol, notation) in enumerate(zip(section_data['chords'], section_data['notes'])):
            yield part_index, part, local, symbol, parse_bar(notation, score['beats'])
