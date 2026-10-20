#!/usr/bin/env python3
"""Generate skins/quiet/styles/quiet/_glyphs.less: every Elastic font glyph redrawn as a Quiet stroke icon.

Elastic draws its icons as FontAwesome glyphs (`content: "\\f1f8"` on a pseudo-element). This script reads
Elastic's compiled CSS, finds every rule that sets such a glyph (keeping its @media context), and emits the
same selector with a CSS-mask stroke icon instead. Icons come from Quiet's own set where one exists, else from
Lucide (ISC, https://lucide.dev), redrawn at Quiet's 1.8 stroke. Hand-tuned rules in icons.less load later and win.

Usage (repo root; after `make css` has copied Elastic's LESS):
  docker compose -f dev/compose.yml run --rm --no-deps node npx lessc skins/elastic/styles/styles.less > /tmp/elastic.css
  npm pack lucide-static@0.460.0 && tar xzf lucide-static-0.460.0.tgz      # -> package/icons/*.svg
  python3 dev/glyphs/gen_glyphs.py /tmp/elastic.css package/icons > skins/quiet/styles/quiet/_glyphs.less
"""
import re
import sys
import urllib.parse

# FontAwesome name -> Quiet LESS variable (@...) or a Lucide icon name.
MAP = {
    'trash-alt': '@quiet-icon-delete', 'times': '@qi-x', 'window-close': '@qi-x', 'user': '@qi-user', 'lock': '@qi-lock',
    'users': '@qi-users', 'user-friends': '@qi-users', 'check': 'check', 'pencil-alt': '@quiet-icon-pencil', 'pen': '@quiet-icon-pencil',
    'edit': '@quiet-icon-pencil', 'envelope': '@quiet-icon-mail', 'envelope-open': '@quiet-icon-mail-open', 'search': '@qi-search',
    'search-plus': '@qi-search-plus', 'search-minus': 'zoom-out', 'cog': '@qi-cog', 'flag': '@quiet-icon-flag',
    'download': '@qi-download', 'upload': '@qi-upload', 'filter': 'filter', 'info-circle': 'info', 'key': 'key-round',
    'folder': '@qi-folder', 'folder-open': 'folder-open', 'comment': '@qi-comment', 'comments': 'messages-square',
    'external-link-square-alt': 'external-link', 'paper-plane': '@quiet-icon-send', 'sync': '@quiet-icon-refresh',
    'plus-square': '@qi-plus', 'plus': '@qi-plus', 'paperclip': '@quiet-icon-clip', 'life-ring': 'life-buoy',
    'sliders-h': '@qi-sliders', 'check-square': 'square-check', 'share': '@quiet-icon-forward', 'inbox': '@qi-inbox',
    'reply': '@quiet-icon-reply', 'reply-all': '@quiet-icon-reply-all', 'archive': '@quiet-icon-archive',
    'angle-down': '@qi-chev-down', 'caret-down': '@qi-chev-down', 'angle-up': '@qi-chev-up', 'angle-right': '@qi-chev-right',
    'chevron-right': '@qi-chev-right', 'angle-left': '@qi-chev-left', 'chevron-left': '@qi-chev-left',
    'angle-double-left': '@qi-chevs-left', 'angle-double-right': '@qi-chevs-right', 'angle-double-down': 'chevrons-down',
    'angle-double-up': 'chevrons-up', 'circle': 'circle', 'file-alt': 'file-text', 'file': 'file', 'file-code': 'file-code',
    'file-pdf': 'file-text', 'file-word': 'file-text', 'file-excel': 'file-spreadsheet', 'file-powerpoint': 'presentation',
    'file-archive': 'file-archive', 'file-image': 'file-image', 'file-audio': 'file-audio', 'file-video': 'file-video',
    'bars': '@qi-bars', 'qrcode': 'qr-code', 'arrow-right': 'arrow-right', 'arrow-left': 'arrow-left', 'undo': 'undo-2',
    'redo': 'redo-2', 'redo-alt': 'rotate-cw', 'user-plus': 'user-plus', 'user-times': 'user-x', 'signature': 'signature',
    'sign-in-alt': 'log-in', 'power-off': 'log-out', 'fire-alt': 'flame', 'eraser': '@qi-eraser', 'circle-notch': 'loader-circle',
    'address-card': '@qi-idcard', 'id-card': '@qi-idcard', 'address-book': '@qi-addrbook', 'image': 'image', 'hdd': 'hard-drive',
    'rss-square': 'rss', 'bell': 'bell', 'eye': 'eye', 'ellipsis-v': 'ellipsis-vertical', 'ellipsis-h': '@quiet-icon-dots',
    'unlock': 'lock-open', 'sun': 'sun', 'moon': 'moon', 'question': 'circle-help', 'question-circle': 'circle-help',
    'calendar-alt': 'calendar', 'calendar': 'calendar', 'tasks': 'list-checks', 'sticky-note': 'sticky-note', 'copy': 'copy',
    'compress-arrows-alt': 'minimize-2', 'tag': 'tag', 'print': '@qi-print', 'save': 'save', 'mouse-pointer': '@qi-cursor',
    'asterisk': '@qi-selall', 'link': 'link', 'spell-check': 'spell-check', 'lightbulb': 'lightbulb',
    'check-circle': 'circle-check', 'exclamation-triangle': 'triangle-alert', 'exclamation-circle': 'circle-alert',
    'clock': 'clock', 'share-square': 'share', 'share-alt': 'share-2', 'shield-alt': 'shield', 'desktop': '@qi-desktop',
    'server': '@qi-server', 'ban': '@qi-ban', 'home': 'house', 'globe': 'globe', 'align-justify': 'text',
}
FA_LESS = 'skins/elastic/styles/fontawesome.less'


def lucide_uri(icons_dir, name):
    svg = open(f'{icons_dir}/{name}.svg').read()
    inner = re.sub(r'\s+', ' ', svg.split('>', 2)[2].rsplit('</svg>', 1)[0]).strip()  # skip the licence comment and <svg ...>
    inner = inner.replace('"', "'").replace(' />', '/>')
    svg = ("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8' "
           "stroke-linecap='round' stroke-linejoin='round'>" + inner + '</svg>')
    return 'url("data:image/svg+xml,' + urllib.parse.quote(svg, safe="/:=' -.,") + '")'


def glyph_rules(css):
    """Yield (media list, selector, codepoint) for every rule that sets a font glyph."""
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)

    def walk(s, media):
        i = 0
        while (j := s.find('{', i)) >= 0:
            head, depth, k = s[i:j].strip(), 1, j + 1
            while depth:
                depth += {'{': 1, '}': -1}.get(s[k], 0)
                k += 1
            body = s[j + 1:k - 1]
            if head.startswith(('@media', '@supports')):
                yield from walk(body, media + [head])
            elif not head.startswith('@'):
                m = re.search(r'content:\s*"\\([0-9a-f]{3,5})"', body)
                if m:
                    yield media, ' '.join(head.split()), m.group(1)
            i = k
    yield from walk(css, [])


def main(elastic_css, icons_dir):
    fa = {}
    for m in re.finditer(r'@fa-var-([a-z0-9-]+):\s*"\\([0-9a-f]+)"', open(FA_LESS).read()):
        fa.setdefault(m.group(2), m.group(1))
    lucide, groups, skipped = {}, {}, set()
    for media, sel, cp in glyph_rules(open(elastic_css).read()):
        name = fa.get(cp)
        icon = MAP.get(name)
        if not icon:
            skipped.add(name or cp)
            continue
        if not icon.startswith('@'):
            lucide.setdefault(icon, lucide_uri(icons_dir, icon))
            icon = '@ql-' + icon
        # One rule per (media, icon), so each icon's data URI is written once per media context. Elastic's own
        # rules for one pseudo-element never set two different glyphs at equal specificity, so grouping keeps the result.
        groups.setdefault((tuple(media), icon), []).append(sel)
    out = []
    for (media, icon), sels in groups.items():
        rule = ',\n'.join(sels) + f' {{ .quiet-glyph(var(--qg-{icon[1:]})); }}'
        for mq in reversed(media):
            rule = f'{mq} {{\n{rule}\n}}'
        out.append(rule)
    print('// GENERATED by dev/glyphs/gen_glyphs.py from Elastic 1.6 compiled CSS: do not edit by hand.')
    print('// Every Elastic font glyph, redrawn as a stroke icon (CSS mask on currentColor). Lucide icons: ISC licence.')
    print(f'// Not mapped (left as Elastic glyphs): {", ".join(sorted(skipped)) or "none"}.\n')
    print('// The glyph box keeps its width: an em space keeps inline pseudo-elements one icon wide. Its height follows')
    print('// the line (as a font glyph would), so the centred mask sits on the text line, not at the top of a 1em box.')
    print('.quiet-glyph(@img) {\n    content: "\\2003";\n    height: auto;\n    background-color: currentColor;\n'
          '    -webkit-mask: @img center / 1.15em no-repeat;\n    mask: @img center / 1.15em no-repeat;\n}\n')
    for name, uri in sorted(lucide.items()):
        print(f'@ql-{name}: {uri};')
    # Each icon image once, as a custom property; the rules below only reference it.
    print('\n:root {')
    for icon in sorted({icon for _, icon in groups}):
        print(f'    --qg-{icon[1:]}: {icon};')
    print('}\n')
    print('\n\n'.join(out))


if __name__ == '__main__':
    main(*sys.argv[1:3])
