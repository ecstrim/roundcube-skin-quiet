/**
 * Quiet skin behaviour. Later tasks extend window.QuietUI.
 */
(function () {
    'use strict';

    var popovers = [];

    function closePopovers() {
        popovers.forEach(function (p) {
            p.menu.hidden = true;
            if (p.anchor) p.anchor.setAttribute('aria-expanded', 'false');
        });
        popovers = [];
    }

    // Show menuEl next to anchorEl (fixed, so the rail's overflow cannot clip it).
    function openPopover(anchorEl, menuEl) {
        closePopovers();
        var r = anchorEl.getBoundingClientRect();
        menuEl.hidden = false;
        menuEl.style.left = Math.round(r.right + 8) + 'px';
        menuEl.style.bottom = Math.max(8, Math.round(window.innerHeight - r.bottom)) + 'px';
        anchorEl.setAttribute('aria-expanded', 'true');
        popovers.push({ anchor: anchorEl, menu: menuEl });
    }

    // Elastic writes the current folder name into #layout-list > .header > .header-title.
    // Mirror it into Quiet's own title so the header can stay hidden on desktop.
    function initListTitle() {
        var src = document.querySelector('#layout-list > .header > .header-title');
        var dst = document.querySelector('#quiet-list-header .quiet-folder-title');
        if (!src || !dst || dst.dataset.quietSynced) return;
        dst.dataset.quietSynced = '1';
        var copy = function () { dst.textContent = src.textContent; };
        new MutationObserver(copy).observe(src, { childList: true, characterData: true, subtree: true });
        copy();
    }

    // ---- Colour scheme (account menu) ----
    // The quietScheme cookie names a variant stylesheet (styles/scheme-<name>.min.css); no cookie = Lake blue,
    // the default styles.min.css. The <head> script in layout.html applies it on load; this switches it live.

    var SCHEMES = ['lake', 'cobalt', 'teal', 'indigo'];
    var SHEET_RE = /\/styles\/(?:styles|scheme-[a-z]+)\.min\.css/;

    // Mobile browser bar (theme-color meta): meta.json can only give one colour, so follow the page background
    // as it changes with the colour scheme and dark mode.
    function syncThemeColor() {
        var meta = document.querySelector('meta[name="theme-color"]');
        if (!meta || !document.body) return;
        var bg = getComputedStyle(document.body).backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') meta.setAttribute('content', bg);
    }

    function currentScheme() {
        return document.documentElement.getAttribute('data-quiet-scheme') || 'lake';
    }

    // Swap the skin stylesheet in win and its frames. The new sheet goes in next to the old one,
    // and the old one is removed once the new one has loaded, so the page never shows unstyled.
    function applyScheme(win, name) {
        var doc;
        try { doc = win.document; } catch (e) { return; } // cross-origin frame
        var old = Array.prototype.filter.call(doc.querySelectorAll('link[rel="stylesheet"]'),
            function (l) { return SHEET_RE.test(l.href); })[0];
        if (old) {
            var href = old.href.replace(SHEET_RE, name === 'lake' ? '/styles/styles.min.css' : '/styles/scheme-' + name + '.min.css');
            if (href !== old.href) {
                var link = doc.createElement('link');
                link.rel = 'stylesheet';
                link.href = href;
                link.onload = link.onerror = function () { old.remove(); if (win === window) syncThemeColor(); };
                old.after(link);
            }
        }
        if (name === 'lake') doc.documentElement.removeAttribute('data-quiet-scheme');
        else doc.documentElement.setAttribute('data-quiet-scheme', name);
        Array.prototype.forEach.call(doc.querySelectorAll('iframe'), function (f) {
            if (f.contentWindow) applyScheme(f.contentWindow, name);
        });
    }

    function initSchemes(menu) {
        var group = menu.querySelector('.quiet-schemes');
        if (!group) return;
        var buttons = group.querySelectorAll('button[data-scheme]');
        var mark = function (name) {
            Array.prototype.forEach.call(buttons, function (b) {
                b.setAttribute('aria-checked', b.dataset.scheme === name ? 'true' : 'false');
            });
        };
        Array.prototype.forEach.call(buttons, function (b) {
            var text = label('quietscheme' + b.dataset.scheme);
            b.title = text;
            b.setAttribute('aria-label', text);
            b.addEventListener('click', function () {
                var name = b.dataset.scheme;
                if (SCHEMES.indexOf(name) < 0) return;
                if (name === 'lake') {
                    window.rcmail.set_cookie('quietScheme', '', new Date()); // delete the cookie
                } else {
                    var exp = new Date();
                    exp.setFullYear(exp.getFullYear() + 1);
                    window.rcmail.set_cookie('quietScheme', name, exp);
                }
                applyScheme(window, name);
                mark(name);
            });
        });
        mark(currentScheme());
    }

    // Error page: Elastic leaves only the rail as a way out; add a Back button under the message.
    function initErrorBack() {
        var box = document.querySelector('body.task-error .boxerror');
        if (!box || box.querySelector('.quiet-error-back') || !window.rcmail) return;
        var a = document.createElement('a');
        a.className = 'btn btn-secondary quiet-error-back';
        a.href = './?_task=mail';
        a.textContent = window.rcmail.get_label('back');
        a.addEventListener('click', function (e) {
            if (window.history.length > 1) { e.preventDefault(); window.history.back(); }
        });
        (box.querySelector('.error-text') || box).appendChild(document.createElement('div')).appendChild(a);
    }

    function init() {
        syncThemeColor();
        // Elastic's dark-mode switch toggles html.dark-mode
        new MutationObserver(syncThemeColor).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        initListTitle();
        initErrorBack();
        var btn = document.getElementById('quiet-account');
        var menu = document.getElementById('quiet-account-menu');
        if (!btn || !menu) return;

        var un = menu.querySelector('.quiet-username');
        var name = un ? un.textContent.trim() : '';
        btn.title = name;
        btn.setAttribute('aria-label', name);
        var initial = btn.querySelector('.quiet-initial');
        if (initial) initial.textContent = (name.charAt(0) || '?').toUpperCase();

        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (menu.hidden) openPopover(btn, menu); else closePopovers();
        });
        initSchemes(menu);
        // Clicking an item (dark toggle, about, logout) closes the popover; clicks elsewhere too.
        // Colour swatches keep it open, so schemes can be compared.
        menu.addEventListener('click', function (e) {
            if (e.target.closest('.quiet-schemes')) return;
            setTimeout(closePopovers, 0);
        });
        document.addEventListener('click', function (e) {
            if (!menu.hidden && !menu.contains(e.target)) closePopovers();
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && !menu.hidden) { closePopovers(); btn.focus(); }
        });
    }

    // ---- Hover quick actions on message-list rows ----
    // One click acts on that row's message only: it is not selected or opened, and the list
    // selection and reading pane stay as they are (unless the message acted on is the open one).

    var ROW_ACTIONS = ['delete', 'archive', 'flag', 'read'];

    function label(name, domain) { return window.rcmail.get_label(name, domain); }

    // "Mark" + "As read" -> "Mark as read" (Roundcube has no single label for these).
    // Shared with message.js (rc = that window's rcmail, whose labels it has).
    function markLabel(name, rc) {
        rc = rc || window.rcmail;
        var s = rc.get_label(name);
        return rc.get_label('mark') + ' ' + s.charAt(0).toLowerCase() + s.slice(1);
    }

    // The archive plugin registered its command (it does so on init, so not yet while the list first fills).
    // Shared with message.js, as is canArchive().
    function hasArchivePlugin(rc) { return !!(rc.commands && 'plugin.archive' in rc.commands); }

    // Is there anything to archive to? Same rule as the plugin's rcmail_is_archive(): not inside the archive itself.
    function canArchive(rc) {
        rc = rc || window.rcmail;
        var env = rc.env, a = env.archive_folder, mbox = String(env.mailbox || '');
        return !!a && mbox !== a && mbox.indexOf(a + env.delimiter) !== 0;
    }

    // Skin label with a {n} placeholder (client-side labels have no variable substitution).
    function countLabel(name, n) { return label(name).replace('{n}', n); }

    function rowLabel(action, row) {
        switch (action) {
            case 'delete': return label('delete');
            case 'archive': return label('buttontext', 'archive');
            case 'flag': return row.flagged ? markLabel('markunflagged') : label('flag');
            case 'read': return row.unread ? markLabel('markread') : markLabel('markunread');
        }
    }

    function updateRowLabels(tr) {
        var list = window.rcmail.message_list, row = list && tr && list.rows[tr.uid];
        if (!row) return;
        Array.prototype.forEach.call(tr.querySelectorAll('.quiet-row-actions button'), function (b) {
            var text = rowLabel(b.getAttribute('data-action'), row);
            if (b.getAttribute('aria-label') !== text) {
                b.setAttribute('aria-label', text);
                b.title = text;
            }
        });
    }

    // Only the list's focused row has its buttons in the tab order.
    function setRowTabbable(tr) {
        var on = tr.classList.contains('focused') ? 0 : -1;
        Array.prototype.forEach.call(tr.querySelectorAll('.quiet-row-actions button'), function (b) {
            if (b.tabIndex !== on) b.tabIndex = on;
        });
    }

    function addRowActions(row) {
        var tr = row && row.obj, td = tr && tr.querySelector('td.subject');
        if (!td || td.querySelector('.quiet-row-actions')) return;
        var uid = row.uid, group = document.createElement('span');
        group.className = 'quiet-row-actions';
        group.setAttribute('role', 'toolbar');
        group.setAttribute('aria-label', label('actions'));
        ROW_ACTIONS.forEach(function (a) {
            if (a === 'archive' && !canArchive()) return;
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'quiet-ra quiet-ra-' + a;
            b.setAttribute('data-action', a);
            group.appendChild(b);
        });
        // The list widget selects on mousedown/mouseup (and touch); keep those events off the row.
        ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'dblclick'].forEach(function (t) {
            group.addEventListener(t, function (e) { e.stopPropagation(); });
        });
        // Enter/Space activate the button; the list's document-level key handler must not see them.
        group.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
        });
        group.addEventListener('click', function (e) {
            var b = e.target.closest && e.target.closest('button[data-action]');
            e.stopPropagation();
            e.preventDefault();
            if (b) rowAction(b.getAttribute('data-action'), uid);
        });
        td.appendChild(group);
        updateRowLabels(tr);
        setRowTabbable(tr);
    }

    // Mirrors rcmail.with_selected_messages() for one UID, without its selection side effects
    // (clear_selection / display_next) and without move_messages()' show_contentframe(false):
    // the selection and reading pane change only when the removed message is selected or open.
    function removeOne(uid, httpAction, post, lock, remove) {
        var rc = window.rcmail, list = rc.message_list, count = 0, root = null, selected;

        delete post._next_uid;
        if (rc.env.threading) {
            count = rc.update_thread(uid);
            root = list.find_root(uid);
        }
        if (remove) {
            selected = list.in_selection(uid);
            // The list's keyboard focus pointer must not stay on a removed row: move it to the next
            // (or previous) visible row, as display_next would, so arrow keys continue from there.
            var node = list.rows[uid] && list.rows[uid].obj,
                focusTo = String(list.last_selected) === String(uid)
                ? (list.get_next_row(uid) || list.get_prev_row(uid) || null) : undefined;
            list.remove_row(uid, false);
            // Fires 'select' when it was the only selected row, so rcmail clears the reading pane.
            if (selected) {
                list.clear_selection(uid);
                if (list.get_selection(false).length) list.triggerEvent('select');
            }
            if (focusTo !== undefined && list.last_selected && String(list.last_selected) === String(uid)) {
                list.last_selected = focusTo && list.rows[focusTo.uid] ? focusTo.uid : null;
                if (list.last_selected) focusTo.classList.add('focused');
                if (node) node.classList.remove('focused');
            }
            if (rc.preview_id !== undefined && String(rc.preview_id) === String(uid)) rc.show_contentframe(false);
            if (root !== null && String(root) !== String(uid)) rc.add_tree_icons(root);
        }
        if (count < 0) post._count = -count;
        else if (count > 0 && remove) rc.delete_excessive_thread_rows();
        if (!remove) post._refresh = 1;

        rc.http_post(httpAction, post, lock);
    }

    function moveOne(uid, target, httpAction) {
        var rc = window.rcmail;
        removeOne(uid, httpAction || 'move', rc.selection_post_data({ _uid: [uid], _target_mbox: target }),
            rc.display_message('movingmessage', 'loading'), !rc.is_multifolder_listing());
    }

    // Same decisions as rcmail.delete_messages(), for one message.
    function deleteOne(uid) {
        var rc = window.rcmail, env = rc.env, trash = env.trash_mailbox, row = rc.message_list.rows[uid];

        if (env.flag_for_deletion) {
            // mark_message() would also call list.focus(), which can jump to the first row.
            if (!env.skip_deleted) return row.deleted ? undefined : rc.flag_as_deleted([uid]);
            // flag_as_deleted() with skip_deleted hides the row, but also moves/clears the selection.
            if (row.deleted) return;
            var post = rc.selection_post_data({ _uid: [uid], _flag: 'delete' });
            if (row.unread) post._ruid = uid;
            return removeOne(uid, 'mark', post, rc.display_message('markingmessage', 'loading'), true);
        }
        if (!trash || env.mailbox == trash
            || (env.delete_junk && env.junk_mailbox && env.mailbox == env.junk_mailbox)) {
            return removeOne(uid, 'delete', rc.selection_post_data({ _uid: [uid] }),
                rc.display_message('deletingmessage', 'loading'), true);
        }
        moveOne(uid, trash);
    }

    /**
     * Run a quick action on one message: 'delete' | 'archive' | 'flag' | 'read' (read toggles read/unread,
     * flag toggles flagged). Never touches rcmail.message_list's selection unless the message is in it.
     */
    function rowAction(action, uid) {
        var rc = window.rcmail, list = rc && rc.message_list, row, id;
        if (!list || !(row = list.rows[uid])) return;
        id = row.uid;  // rcmail compares some UIDs strictly (e.g. preview_id): keep the list's own value

        // With "select all (all pages)" active, rcmail sends _uid=* for any request: switch it off for this one.
        var allMode = rc.select_all_mode;
        rc.select_all_mode = false;
        try {
            switch (action) {
                case 'delete': deleteOne(id); break;
                case 'archive': if (canArchive()) moveOne(id, rc.env.archive_folder, 'plugin.move2archive'); break;
                // Not mark_message(): its list.focus() selects/scrolls to the first row when nothing has focus.
                case 'flag': rc.toggle_flagged_status(row.flagged ? 'unflagged' : 'flagged', [id]); break;
                case 'read': rc.toggle_read_status(row.unread ? 'read' : 'unread', [id]); break;
            }
        } finally {
            rc.select_all_mode = allMode;
        }
        if (list.rows[id]) updateRowLabels(row.obj);
    }

    function initRowActions(rc) {
        var list = rc.message_list, table = list && list.list, lastTr = null;
        if (!table || table.dataset.quietRowActions) return;
        table.dataset.quietRowActions = '1';

        rc.addEventListener('insertrow', function (o) { addRowActions(o.row); });
        Object.keys(list.rows).forEach(function (uid) { addRowActions(list.rows[uid]); });

        // Flag/read labels follow the row state (it can change elsewhere): refresh on hover and focus.
        var refresh = function (e) {
            var tr = e.target.closest && e.target.closest('tr');
            if (tr && tr !== lastTr) { lastTr = tr; updateRowLabels(tr); }
        };
        table.addEventListener('mouseover', refresh);
        table.addEventListener('focusin', function (e) { lastTr = null; refresh(e); });

        new MutationObserver(function (muts) {
            muts.forEach(function (m) { if (m.target.nodeName === 'TR') setRowTabbable(m.target); });
        }).observe(table, { attributes: true, attributeFilter: ['class'], subtree: true });
    }


    // ---- Multi-select: action bar next to the folder title + reading-pane empty state ----
    // Shown (CSS, body.quiet-multi) while more than one message is selected. The buttons run Roundcube's
    // normal selection commands; the hover quick actions (rowAction) are not involved.

    var MULTI_ACTIONS = ['delete', 'archive', 'flag', 'read', 'move', 'clear'];

    function selectedRows(list) {
        return list.get_selection(false).map(function (uid) { return list.rows[uid]; }).filter(Boolean);
    }

    // All selected rows flagged? Not knowable for "select all (all pages)": the unloaded rows are unseen.
    function allFlagged(rc, rows) {
        return !rc.select_all_mode && rows.length > 0 && rows.every(function (r) { return r.flagged; });
    }

    // With "select all (all pages)" rcmail acts on the whole folder/search (_uid=*): show that total.
    function selectedCount(rc, rows) {
        var total = parseInt(rc.env.messagecount, 10);
        return rc.select_all_mode && total > rows.length ? total : rows.length;
    }

    function multiCommand(rc, action, e) {
        var list = rc.message_list, rows = selectedRows(list);
        switch (action) {
            case 'delete': rc.command('delete', '', e.target, e); break;
            case 'archive': rc.command('plugin.archive', '', e.target, e); break;
            case 'flag':
                rc.command('mark', allFlagged(rc, rows) ? 'unflagged' : 'flagged', e.target, e);
                break;
            case 'read': rc.command('mark', 'read', e.target, e); break;
            case 'move': rc.command('move', '', e.target, e); break;
            case 'clear': list.clear_selection(); break;
        }
    }

    function multiLabel(rc, action, rows) {
        switch (action) {
            case 'delete': return label('delete');
            case 'archive': return label('buttontext', 'archive');
            case 'flag':
                return allFlagged(rc, rows) ? markLabel('markunflagged') : label('flag');
            case 'read': return markLabel('markread');
            case 'move': return label('moveto');
            case 'clear': return label('quietclearselection');
        }
    }

    function buildMultiBar(rc, bar) {
        var count = document.createElement('span');
        count.className = 'quiet-multi-count';
        bar.appendChild(count);
        var tools = document.createElement('div');
        tools.className = 'quiet-multi-tools';
        tools.setAttribute('role', 'toolbar');
        tools.setAttribute('aria-label', label('actions'));
        MULTI_ACTIONS.forEach(function (a) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'quiet-mb quiet-mb-' + a;
            if (a === 'archive' && !hasArchivePlugin(rc)) return;
            b.setAttribute('data-action', a);
            if (a === 'delete') b.appendChild(document.createElement('span')).className = 'quiet-mb-text';
            if (a === 'clear') b.textContent = '\u00d7';
            tools.appendChild(b);
        });
        tools.addEventListener('click', function (e) {
            var b = e.target.closest && e.target.closest('button[data-action]');
            if (!b) return;
            e.preventDefault();
            multiCommand(rc, b.getAttribute('data-action'), e);
        });
        bar.appendChild(tools);
    }

    function updateMultiBar(rc) {
        var list = rc.message_list, bar = document.getElementById('quiet-multibar');
        if (!list || !bar) return;
        var rows = selectedRows(list), n = selectedCount(rc, rows), multi = rows.length > 1;
        document.body.classList.toggle('quiet-multi', multi);
        if (!multi) return;
        if (!bar.firstChild) buildMultiBar(rc, bar);
        bar.querySelector('.quiet-multi-count').textContent = countLabel('quietnselected', n);
        var title = document.querySelector('#quiet-multi-empty .quiet-empty-title');
        if (title) title.textContent = countLabel('quietmessagesselected', n);
        Array.prototype.forEach.call(bar.querySelectorAll('button[data-action]'), function (b) {
            var a = b.getAttribute('data-action');
            if (a === 'archive') b.hidden = !canArchive();
            var text = multiLabel(rc, a, rows);
            b.setAttribute('aria-label', text);
            b.title = text;
            if (a === 'delete') b.querySelector('.quiet-mb-text').textContent = text;
            if (a === 'flag') b.classList.toggle('on', allFlagged(rc, rows));
        });
    }

    function initMultiSelect(rc) {
        var list = rc.message_list;
        if (!list || document.body.dataset.quietMulti) return;
        document.body.dataset.quietMulti = '1';
        var update = function () { updateMultiBar(rc); };
        list.addEventListener('select', update);
        rc.addEventListener('listupdate', update);
        rc.addEventListener('afterlist', update);
        // 'Current page' after 'All' re-selects the same rows (no 'select' event) but ends select-all mode.
        rc.addEventListener('actionafter', function (o) { if (o && o.action === 'select-all') update(); });
        // Flag/read changes on the selected rows (from the bar or elsewhere) change the labels.
        new MutationObserver(function () { if (document.body.classList.contains('quiet-multi')) update(); })
            .observe(list.list, { attributes: true, attributeFilter: ['class'], subtree: true });
    }

    // rcmail exists already (created in <head>) but is initialised later: run fn on its 'init', or at once if it has.
    function onRcmailInit(fn) {
        var hook = function () {
            var rc = window.rcmail;
            if (!rc || !rc.addEventListener) return;
            if (rc.loaded) fn(rc);
            else rc.addEventListener('init', function () { fn(rc); });
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook);
        else hook();
    }

    window.QuietUI = window.QuietUI || {};
    window.QuietUI.init = init;
    window.QuietUI.openPopover = openPopover;
    window.QuietUI.closePopovers = closePopovers;
    window.QuietUI.rowAction = rowAction;
    window.QuietUI.moveOne = moveOne;
    window.QuietUI.markLabel = markLabel;
    window.QuietUI.canArchive = canArchive;
    window.QuietUI.hasArchivePlugin = hasArchivePlugin;

    onRcmailInit(initRowActions);
    onRcmailInit(initMultiSelect);

    if (window.rcmail && rcmail.addEventListener) {
        rcmail.addEventListener('init', init);
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }
})();
