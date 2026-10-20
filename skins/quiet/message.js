/**
 * Quiet: open-message page (reading pane iframe and full view), mockup ReadR6.
 * Runs after rcmail.init(). Inside the preview frame the action buttons forward to the
 * parent window's rcmail, whose list selection is the open message (as Roundcube does
 * for commands the frame does not handle itself).
 */
(function () {
    'use strict';

    var $ = window.jQuery;
    var rc = window.rcmail;
    if (!$ || !rc) return;

    var html = document.documentElement;
    var preview = rc.is_framed() && rc.env.action === 'preview';
    // The rcmail that owns the message list; for full view it is this window's.
    var host = preview ? window.parent.rcmail : rc;
    var hostWin = preview ? window.parent : window;
    // Shared helpers (mark label, archive availability) live in quiet.js, loaded in the host page.
    var Q = hostWin.QuietUI;

    function label(name) { return rc.get_label(name); }

    // Elastic's "small" screen is <= 768px of the *window*, not of this iframe.
    function updateNarrow() {
        html.classList.toggle('quiet-narrow', hostWin.innerWidth <= 768);
    }

    function initials(name) {
        var words = name.replace(/[<>"(),]/g, ' ').trim().split(/\s+/).filter(Boolean);
        if (!words.length) return '?';
        var first = words[0].charAt(0);
        var last = words.length > 1 ? words[words.length - 1].charAt(0) : '';
        return (first + last).toUpperCase();
    }

    function initSender() {
        var a = document.querySelector('.quiet-from a.rcmContactAddress');
        var avatar = document.querySelector('.quiet-avatar');
        if (!a) {
            if (avatar) avatar.textContent = '?';
            return;
        }
        var name = a.textContent.trim();
        var addr = a.getAttribute('title') || '';
        if (avatar) avatar.textContent = initials(name || addr);
        if (addr && name !== addr && !document.querySelector('.quiet-from .quiet-addr')) {
            var s = document.createElement('span');
            s.className = 'quiet-addr';
            s.textContent = '<' + addr + '>';
            var holder = a.closest('.adr') || a.parentNode;
            holder.insertBefore(s, a.nextSibling);
        }
    }

    // Separators lead each item of the sender meta line; the item that starts a wrapped line drops its own,
    // so no "·" dangles at a line edge. Items are measured in order with every later separator shown, and a
    // forced break (.quiet-break) keeps a line-start item on its new line: without its "·" it is narrower and
    // would otherwise jump back up to the end of the previous line.
    function markLineStarts() {
        var meta = document.querySelector('.quiet-meta');
        if (!meta) return;
        $(meta).find('.quiet-break').remove();
        var items = Array.prototype.slice.call(meta.querySelectorAll(':scope > :not(.header-links), :scope > .header-links > a'));
        items.forEach(function (el) { el.classList.remove('quiet-linestart'); });
        items.forEach(function (el, i) {
            if (i === 0 || el.getBoundingClientRect().top <= items[i - 1].getBoundingClientRect().top + 2) return;
            var br = document.createElement('span');
            br.className = 'quiet-break';
            br.setAttribute('aria-hidden', 'true');
            el.parentNode.insertBefore(br, el);
            el.classList.add('quiet-linestart');
        });
    }

    function initMeta() {
        markLineStarts();
        window.addEventListener('resize', markLineStarts);
        var meta = document.querySelector('.quiet-meta');
        // The meta line also changes width when the sender block does (details toggle, late fonts).
        if (meta && window.ResizeObserver) new ResizeObserver(markLineStarts).observe(meta);
    }

    // Icon-only buttons: name them for assistive tech (the visible text is clipped away).
    function labelIconButtons() {
        $('.quiet-icononly').each(function () {
            var t = this.getAttribute('title') || $(this).text().trim();
            this.setAttribute('aria-label', t);
            if (!this.getAttribute('title')) this.setAttribute('title', t);
        });
    }

    function syncFlag() {
        var on = document.body.classList.contains('status-flagged');
        var b = document.getElementById('quiet-msg-flag');
        if (!b) return;
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        var t = on ? label('markunflagged') : label('flag');
        b.setAttribute('title', t);
        b.setAttribute('aria-label', t);
    }

    // Archive plugin: only offered when its command exists (the plugin does not load in the preview frame).
    function initArchive() {
        var b = document.getElementById('quiet-u-archive');
        if (!b) return;
        if (!Q || !Q.hasArchivePlugin(host) || !Q.canArchive(host)) {
            b.parentNode.removeChild(b);
            return;
        }
        // The plugin's own label when the host has it, else the skin's (already in the button).
        var text = host.get_label('buttontext', 'archive');
        if (text && text !== 'buttontext' && text.charAt(0) !== '[') b.querySelector('.inner').textContent = text;
        b.hidden = false;
        syncArchive();
    }

    function syncArchive() {
        var b = document.getElementById('quiet-u-archive');
        if (!b) return;
        var on = !!host.commands['plugin.archive'];
        b.classList.toggle('disabled', !on);
        b.setAttribute('aria-disabled', on ? 'false' : 'true');
        b.tabIndex = on ? 0 : -1;
    }

    // "Download all" belongs to the attachments row (Elastic moves it into the header links).
    function moveZipLink() {
        var row = document.getElementById('quiet-attachments');
        var z = document.querySelector('a.zipdownload');
        if (row && z && z.parentNode !== row) row.appendChild(z);
    }

    // A position in the parent page for the folder selector popup (the frame's own coordinates are offset).
    function parentAnchor(el) {
        var doc = hostWin.document, r = el.getBoundingClientRect();
        var fr = window.frameElement ? window.frameElement.getBoundingClientRect() : { left: 0, top: 0 };
        var a = doc.getElementById('quiet-move-anchor');
        if (!a) {
            a = doc.createElement('a');
            a.id = 'quiet-move-anchor';
            a.setAttribute('aria-hidden', 'true');
            doc.body.appendChild(a);
        }
        a.style.cssText = 'position:fixed;visibility:hidden;width:1px;height:1px;'
            + 'left:' + Math.round(fr.left + r.left + r.width / 2) + 'px;top:' + Math.round(fr.top + r.top + r.height) + 'px';
        return a;
    }

    // The reading pane is a view of one message (rc.env.uid). The parent's commands act on its list
    // *selection*, which only is that message when exactly it is selected: not a collapsed thread
    // parent (rcmail then includes the children), not "select all", not a selection that moved on.
    function hostIsSafe() {
        if (!preview) return true;
        var list = host.message_list;
        if (!list || host.select_all_mode) return false;
        var sel = list.get_single_selection();
        if (sel === null || sel === undefined || String(sel) !== String(rc.env.uid)) return false;
        var row = list.rows[sel];
        return !(row && row.has_children && !row.expanded);
    }

    // The same actions on exactly the open message, without using the parent's selection.
    function runOnOpenMessage(cmd, prop, el, e) {
        var uid = rc.env.uid, list = host.message_list, row = list && list.rows[uid];
        var body = document.body.classList;
        if (!Q || !row) {
            // Not in the list (e.g. another folder view): only commands that need no list can run.
            if (['delete', 'move', 'mark', 'plugin.archive'].indexOf(cmd) < 0) rc.command(cmd, prop, el, e);
            return;
        }
        if (cmd === 'delete') Q.rowAction('delete', uid);
        else if (cmd === 'plugin.archive') Q.rowAction('archive', uid);
        else if (cmd === 'flag') {
            var wasFlagged = !!row.flagged;
            Q.rowAction('flag', uid);
            body.toggle('status-flagged', !wasFlagged);
        }
        else if (cmd === 'mark') { if (prop === 'unread' && !row.unread) Q.rowAction('read', uid); }
        else if (cmd === 'move') {
            var target = parentAnchor(el);
            host.folder_selector({
                type: 'click', target: target, pageX: parseInt(target.style.left, 10), pageY: parseInt(target.style.top, 10),
                preventDefault: function () {}, stopPropagation: function () {},
            }, function (folder) { Q.moveOne(uid, folder); });
        }
        else rc.command(cmd, prop, el, e);  // reply, print, download, ...: these use rc.env.uid anyway
    }

    function run(el, e) {
        var cmd = el.getAttribute('data-quiet-cmd');
        var prop = el.getAttribute('data-quiet-prop') || undefined;
        if (!hostIsSafe()) return runOnOpenMessage(cmd, prop, el, e);
        if (cmd === 'flag') {
            host.command('mark', document.body.classList.contains('status-flagged') ? 'unflagged' : 'flagged', el, e);
        }
        else if (cmd === 'move' && preview) {
            var target = parentAnchor(el);
            host.command('move', undefined, target, {
                type: 'click', target: target, pageX: parseInt(target.style.left, 10), pageY: parseInt(target.style.top, 10),
                preventDefault: function () {}, stopPropagation: function () {},
            });
        }
        else {
            host.command(cmd, prop, el, e);
        }
    }

    // Capture phase: runs before Roundcube's own onclick, so in the preview frame the buttons
    // act on the parent's rcmail, and Flag toggles by the current state.
    function initClicks() {
        document.addEventListener('click', function (e) {
            var el = e.target.closest && e.target.closest('.quiet-act[data-quiet-cmd]');
            if (!el) return;
            var cmd = el.getAttribute('data-quiet-cmd');
            if (!preview && cmd !== 'flag') {
                if (cmd === 'plugin.archive') { e.preventDefault(); e.stopImmediatePropagation(); if (!el.classList.contains('disabled')) run(el, e); }
                return;  // Roundcube handles the click
            }
            e.preventDefault();
            e.stopImmediatePropagation();
            if (el.classList.contains('disabled')) return;
            run(el, e);
        }, true);
    }

    function init() {
        updateNarrow();
        hostWin.addEventListener('resize', updateNarrow);
        // The host page outlives this frame: drop the handler when the frame goes away (a new one is added per message).
        // hostWin.QuietUI.resizeHandlers counts the live ones (read by the tests).
        if (preview && Q) {
            Q.resizeHandlers = (Q.resizeHandlers || 0) + 1;
            window.addEventListener('pagehide', function () {
                hostWin.removeEventListener('resize', updateNarrow);
                Q.resizeHandlers--;
            }, { once: true });
        }
        initSender();
        initMeta();
        labelIconButtons();
        var unread = document.querySelector('#quiet-u-unread .inner');
        if (unread && Q) unread.textContent = Q.markLabel('markunread', rc);
        syncFlag();
        new MutationObserver(syncFlag).observe(document.body, { attributes: true, attributeFilter: ['class'] });
        initArchive();
        moveZipLink();
        initClicks();
    }

    $(init);
})();
