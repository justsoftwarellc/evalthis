#!/usr/bin/env bash
#
# banner.sh -- the evalme install banner.
#
# "EVALme" as a chunky pixel wordmark, animated in the style of a 90s Capcom
# arcade intro: letters fly in from alternating sides, each one SLAMMING into
# place with a screen shake, then the finished logo flashes through a color
# cycle and settles on the brand green.
#
# Sourced by install.sh; also runnable on its own to preview:
#   ./banner.sh            # animated
#   ./banner.sh --static   # final frame only (no animation, no cursor tricks)
#
# Degrades on purpose: no color -> plain text, no UTF-8 -> ASCII blocks, not a
# TTY (piped to `sh`, CI logs) -> one static frame, narrow terminal -> compact
# mark. The installer must never hang or spray escape codes into a logfile
# because of decoration.
#
# Implementation note: the render path uses only parameter expansion -- no
# `cut`, no subshells in the inner loops. Forking per cell per frame costs
# thousands of processes and turns a 1s animation into a 9s one.

# ----------------------------------------------------------- capabilities ---

banner_supports_color() {
    [ -t 1 ] || return 1
    [ -z "${NO_COLOR:-}" ] || return 1
    case "${TERM:-dumb}" in dumb|"") return 1 ;; esac
    return 0
}

banner_supports_unicode() {
    case "${LC_ALL:-${LC_CTYPE:-${LANG:-}}}" in
        *UTF-8*|*utf8*|*UTF8*|*utf-8*) return 0 ;;
    esac
    return 1
}

banner_is_animatable() {
    [ -t 1 ] || return 1
    [ -z "${EVALME_NO_ANIM:-}" ] || return 1
    [ -z "${CI:-}" ] || return 1
    banner_supports_color || return 1
    return 0
}

banner_term_cols() {
    # COLUMNS is 0 or empty in non-interactive shells; only trust a real one.
    case "${COLUMNS:-}" in
        ''|*[!0-9]*) ;;
        0) ;;
        *) printf '%s' "$COLUMNS"; return ;;
    esac
    _c=$(tput cols 2>/dev/null) || _c=''
    case "$_c" in
        ''|*[!0-9]*|0) printf '80' ;;
        *) printf '%s' "$_c" ;;
    esac
}

# ------------------------------------------------------------------ glyphs ---
#
# 34x7 pixel grid spelling "EVALme". '#' is an inked cell, '.' is empty.
# Caps are 7 rows; lowercase 'm' and 'e' are 5 rows tall on the same
# baseline, so the mixed case reads as one word rather than two sizes.

BANNER_ROW0='#####.#...#..###..#...............'
BANNER_ROW1='#.....#...#.#...#.#...............'
BANNER_ROW2='#.....#...#.#...#.#.....####...##.'
BANNER_ROW3='####..#...#.#####.#.....#.#.#.#..#'
BANNER_ROW4='#......#.#..#...#.#.....#.#.#.####'
BANNER_ROW5='#......#.#..#...#.#.....#.#.#.#...'
BANNER_ROW6='#####...#...#...#.#####.#.#.#..###'

BANNER_H=7
BANNER_W=34

banner_row() {
    case "$1" in
        0) printf '%s' "$BANNER_ROW0" ;; 1) printf '%s' "$BANNER_ROW1" ;;
        2) printf '%s' "$BANNER_ROW2" ;; 3) printf '%s' "$BANNER_ROW3" ;;
        4) printf '%s' "$BANNER_ROW4" ;; 5) printf '%s' "$BANNER_ROW5" ;;
        6) printf '%s' "$BANNER_ROW6" ;;
    esac
}

# One piece per letter: E V A L m e. Each flies in and slams home in turn.
BANNER_PIECES='0:4 6:10 12:16 18:22 24:28 30:33'
BANNER_NPIECES=6

# Brand green -- where every letter lands and the logo finally rests.
BANNER_LOCK_RGB='88;224;96'
# The post-assembly flash cycle: white hot, then down through the arcade
# palette into the brand color.
BANNER_FLASH='255;255;255 198;255;208 120;240;150 88;224;96'

BANNER_CELL_ON=''
BANNER_CELL_OFF='  '
BANNER_CELL_WIDTH=2

banner_init_cells() {
    if banner_supports_unicode; then
        BANNER_CELL_ON=$(printf '\342\226\210\342\226\210')   # two full blocks
    else
        BANNER_CELL_ON='##'
    fi
    # On a terminal too narrow for the doubled mark, drop to one cell per
    # pixel rather than wrapping into unreadable garbage.
    if [ "$(banner_term_cols)" -lt $((BANNER_W * 2 + 6)) ]; then
        BANNER_CELL_WIDTH=1
        if banner_supports_unicode; then
            BANNER_CELL_ON=$(printf '\342\226\210')
        else
            BANNER_CELL_ON='#'
        fi
        BANNER_CELL_OFF=' '
    fi
}

# ------------------------------------------------------------------ render ---

# banner_row_cells <rowstring> <lo> <hi>
# Render one row into BANNER_OUT, inking only columns in [lo,hi]. Pure
# parameter expansion: walk the string consuming one char at a time.
BANNER_OUT=''
banner_row_cells() {
    _rest="$1"; _lo="$2"; _hi="$3"
    BANNER_OUT=''
    _i=0
    while [ -n "$_rest" ]; do
        _ch=${_rest%"${_rest#?}"}
        _rest=${_rest#?}
        if [ "$_ch" = '#' ] && [ "$_i" -ge "$_lo" ] && [ "$_i" -le "$_hi" ]; then
            BANNER_OUT="$BANNER_OUT$BANNER_CELL_ON"
        else
            BANNER_OUT="$BANNER_OUT$BANNER_CELL_OFF"
        fi
        _i=$((_i + 1))
    done
}

banner_static() {
    printf '\n'
    _r=0
    while [ "$_r" -lt "$BANNER_H" ]; do
        banner_row_cells "$(banner_row "$_r")" 0 $((BANNER_W - 1))
        if banner_supports_color; then
            printf '  \033[38;2;%sm%s\033[0m\n' "$BANNER_LOCK_RGB" "$BANNER_OUT"
        else
            printf '  %s\n' "$BANNER_OUT"
        fi
        _r=$((_r + 1))
    done
    printf '\n'
}

# Draw one frame.
#   $1 locked  -- pieces 0..locked-1 are settled
#   $2 active  -- index of the flying piece, or -1 for none
#   $3 offset  -- horizontal cells the flying piece still has to travel
#                 (negative = approaching from the left, positive = right)
#   $4 rgb     -- color for the settled letters
#   $5 shake   -- extra indent for the screen-shake kick
banner_frame() {
    _locked="$1"; _active="$2"; _off="$3"; _rgb="$4"; _shake="${5:-0}"

    # Pieces land left to right, so one range covers everything settled.
    _lockhi=-1
    _p=0
    for _range in $BANNER_PIECES; do
        [ "$_p" -lt "$_locked" ] || break
        _lockhi=${_range##*:}
        _p=$((_p + 1))
    done

    _as=-1; _ae=-1
    _p=0
    for _range in $BANNER_PIECES; do
        if [ "$_p" -eq "$_active" ]; then
            _as=${_range%%:*}; _ae=${_range##*:}
        fi
        _p=$((_p + 1))
    done

    # The shake displaces the whole mark horizontally for a frame or two.
    _pad='  '
    case "$_shake" in
        1) _pad='   ' ;;
        2) _pad=' ' ;;
    esac

    _r=0
    while [ "$_r" -lt "$BANNER_H" ]; do
        banner_row_cells "$(banner_row "$_r")" 0 "$_lockhi"
        printf '\033[2K%s\033[38;2;%sm%s\033[0m' "$_pad" "$_rgb" "$BANNER_OUT"

        # Overlay the flying letter at its current horizontal offset.
        if [ "$_as" -ge 0 ]; then
            _srow=$(banner_row "$_r")
            _rest="$_srow"; _i=0
            while [ -n "$_rest" ]; do
                _ch=${_rest%"${_rest#?}"}
                _rest=${_rest#?}
                if [ "$_ch" = '#' ] && [ "$_i" -ge "$_as" ] && [ "$_i" -le "$_ae" ]; then
                    _col=$((_i + _off))
                    if [ "$_col" -ge 0 ] && [ "$_col" -lt "$BANNER_W" ]; then
                        # +1 for the terminal's 1-based columns, +2 indent.
                        printf '\033[%dG\033[38;2;%sm%s\033[0m' \
                            $((3 + _col * BANNER_CELL_WIDTH)) \
                            "$BANNER_LOCK_RGB" "$BANNER_CELL_ON"
                    fi
                fi
                _i=$((_i + 1))
            done
        fi
        printf '\n'
        _r=$((_r + 1))
    done
}

banner_rewind() { printf '\033[%dA' "$BANNER_H"; }

# A letter flies in from off-screen and slams home, then the screen kicks.
banner_slam() {
    _piece="$1"; _from="$2"

    # Approach: a few long strides that decelerate into the final position.
    for _off in $_from; do
        banner_frame "$_piece" "$_piece" "$_off" "$BANNER_LOCK_RGB" 0
        banner_sleep "$BANNER_SPEED_FLY"
        banner_rewind
    done

    # Impact: the letter is now locked, and the whole mark kicks sideways.
    banner_frame $((_piece + 1)) -1 0 '255;255;255' 1
    banner_sleep "$BANNER_SPEED_HIT"
    banner_rewind
    banner_frame $((_piece + 1)) -1 0 "$BANNER_LOCK_RGB" 2
    banner_sleep "$BANNER_SPEED_HIT"
    banner_rewind
    banner_frame $((_piece + 1)) -1 0 "$BANNER_LOCK_RGB" 0
    banner_sleep "$BANNER_SPEED_HIT"
    banner_rewind
}

# banner_path <piece> -- build the flight path for one letter into
# BANNER_PATH: offsets from the letter's resting position, decelerating in.
# Even pieces enter from the left edge, odd from the right.
BANNER_PATH=''
banner_path() {
    _p="$1"
    _s=-1; _e=-1; _n=0
    for _range in $BANNER_PIECES; do
        if [ "$_n" -eq "$_p" ]; then _s=${_range%%:*}; _e=${_range##*:}; fi
        _n=$((_n + 1))
    done
    _lw=$((_e - _s + 1))
    if [ $((_p % 2)) -eq 0 ]; then
        _d=$((_s + _lw))          # distance to just past the left edge
        _sign='-'
    else
        _d=$((BANNER_W - _s))     # distance to just past the right edge
        _sign=''
    fi
    # Decelerating stops, nearest first. Emitted far-to-near and de-duplicated
    # so the letter never stalls or steps backwards on short flights.
    BANNER_PATH=''
    _prev=0
    for _frac in 100 58 30 12 3; do
        _step=$(((_d * _frac + 99) / 100))
        [ "$_step" -lt 1 ] && _step=1
        if [ -z "$BANNER_PATH" ] || [ "$_step" -lt "$_prev" ]; then
            BANNER_PATH="$BANNER_PATH $_sign$_step"
            _prev="$_step"
        fi
    done
    BANNER_PATH=${BANNER_PATH# }
}

banner_animate() {
    printf '\n'
    printf '\033[?25l'   # hide cursor

    _piece=0
    while [ "$_piece" -lt "$BANNER_NPIECES" ]; do
        # Alternate the side each letter flies in from, Capcom-style. The
        # path is computed per letter so every one enters from just off its
        # own edge: a fixed offset list would leave letters near the middle
        # invisible for the first frames and make them pop rather than fly.
        banner_path "$_piece"
        banner_slam "$_piece" "$BANNER_PATH"
        _piece=$((_piece + 1))
    done

    # The logo flashes through the arcade palette and settles.
    for _c in $BANNER_FLASH; do
        banner_frame "$BANNER_NPIECES" -1 0 "$_c" 0
        banner_sleep "$BANNER_SPEED_FLASH"
        banner_rewind
    done

    banner_frame "$BANNER_NPIECES" -1 0 "$BANNER_LOCK_RGB" 0
    printf '\033[?25h'   # show cursor
    printf '\n'
}

# Frame delays. `sleep` with a fraction is not in POSIX, so probe once and
# fall back to no delay rather than stalling a whole second per frame.
BANNER_SPEED_FLY='0.016'
BANNER_SPEED_HIT='0.038'
BANNER_SPEED_FLASH='0.07'

BANNER_CAN_FSLEEP=''
banner_sleep() {
    if [ -z "$BANNER_CAN_FSLEEP" ]; then
        if sleep 0.01 2>/dev/null; then BANNER_CAN_FSLEEP=yes; else BANNER_CAN_FSLEEP=no; fi
    fi
    [ "$BANNER_CAN_FSLEEP" = yes ] && sleep "$1"
    return 0
}

banner_show() {
    banner_init_cells
    if [ "${1:-}" = '--static' ] || ! banner_is_animatable; then
        banner_static
        return 0
    fi
    # Never leave the cursor hidden if the user interrupts mid-animation.
    trap 'printf "\033[?25h"; exit 130' INT TERM
    banner_animate
    trap - INT TERM
}

# Run directly (not sourced) -> show the banner.
if [ "${BASH_SOURCE:-$0}" = "$0" ]; then
    banner_show "${1:-}"
fi
